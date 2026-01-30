import { r as getHostUrl } from "./src-BaHhVWSg.mjs";
import { i as getCachedCliHost, o as getDatabricksToken, s as getDatabricksUserIdentity, t as getAuthMethod } from "./src-pe6ovBD5.mjs";
import { extractReasoningMiddleware, wrapLanguageModel } from "ai";
import { createDatabricksProvider } from "@databricks/ai-sdk-provider";

//#region ../packages/ai-sdk-providers/src/databricks-foundation-provider.ts
const FOUNDATION_MODELS = [
	"databricks-dbrx-instruct",
	"databricks-meta-llama-3-3-70b-instruct",
	"databricks-mixtral-8x7b-instruct",
	"databricks-meta-llama-3-1-70b-instruct",
	"databricks-meta-llama-3-1-405b-instruct",
	"databricks-meta-llama-3-2-1b-instruct",
	"databricks-meta-llama-3-2-3b-instruct",
	"databricks-meta-llama-3-2-11b-vision-instruct",
	"databricks-meta-llama-3-2-90b-vision-instruct",
	"databricks-gte-large-en",
	"databricks-bge-large-en",
	"databricks-mpt-7b-instruct",
	"databricks-mpt-30b-instruct",
	"databricks-gpt-5-2",
	"databricks-gpt-4o-mini"
];
let foundationProviderCache = null;
let foundationProviderCacheTime = 0;
const PROVIDER_CACHE_DURATION$1 = 300 * 1e3;
const foundationModelCache = /* @__PURE__ */ new Map();
const MODEL_CACHE_DURATION = 300 * 1e3;
/**
* Get or create the Databricks Foundation Model provider
*/
async function getOrCreateFoundationProvider() {
	if (foundationProviderCache && Date.now() - foundationProviderCacheTime < PROVIDER_CACHE_DURATION$1) {
		console.log("[Foundation] Using cached Foundation Model provider");
		return foundationProviderCache;
	}
	console.log("[Foundation] Creating new Foundation Model provider");
	const token = await getDatabricksToken();
	const provider = createDatabricksProvider({
		baseURL: `${getHostUrl()}/serving-endpoints`,
		fetch: async (...[input, init]) => {
			const headers = new Headers(init?.headers);
			headers.set("Authorization", `Bearer ${token}`);
			const url = input.toString();
			if (init?.body) try {
				const requestBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
				console.log("[Foundation] Request:", JSON.stringify({
					url,
					method: init.method || "POST",
					model: requestBody.model,
					messageCount: requestBody.messages?.length
				}));
			} catch (_e) {
				console.log("[Foundation] Request (raw):", {
					url,
					method: init.method
				});
			}
			const response = await fetch(input, {
				...init,
				headers
			});
			console.log(`[Foundation] Response status: ${response.status}`);
			return response;
		}
	});
	foundationProviderCache = provider;
	foundationProviderCacheTime = Date.now();
	return provider;
}
/**
* Get a Foundation Model language model instance
*/
async function getFoundationModel(modelId) {
	const cached = foundationModelCache.get(modelId);
	if (cached && Date.now() - cached.timestamp < MODEL_CACHE_DURATION) {
		console.log(`[Foundation] Using cached model for ${modelId}`);
		return cached.model;
	}
	console.log(`[Foundation] Creating fresh model for ${modelId}`);
	const wrappedModel = wrapLanguageModel({
		model: (await getOrCreateFoundationProvider()).chatCompletions(modelId),
		middleware: [extractReasoningMiddleware({ tagName: "think" })]
	});
	foundationModelCache.set(modelId, {
		model: wrappedModel,
		timestamp: Date.now()
	});
	return wrappedModel;
}
/**
* Check if a model ID is a Foundation Model
*/
function isFoundationModel(modelId) {
	return FOUNDATION_MODELS.includes(modelId);
}
/**
* Get the default Foundation Model
*/
function getDefaultFoundationModel() {
	return process.env.DEFAULT_FOUNDATION_MODEL || "databricks-meta-llama-3-3-70b-instruct";
}

//#endregion
//#region ../packages/ai-sdk-providers/src/providers-server.ts
async function getProviderToken() {
	if (process.env.DATABRICKS_TOKEN) {
		console.log("Using PAT token from DATABRICKS_TOKEN env var");
		return process.env.DATABRICKS_TOKEN;
	}
	return getDatabricksToken();
}
let cachedWorkspaceHostname = null;
async function getWorkspaceHostname() {
	if (cachedWorkspaceHostname) return cachedWorkspaceHostname;
	try {
		if (getAuthMethod() === "cli") {
			await getDatabricksUserIdentity();
			const cliHost = getCachedCliHost();
			if (cliHost) {
				cachedWorkspaceHostname = cliHost;
				return cachedWorkspaceHostname;
			} else throw new Error("CLI authentication succeeded but hostname was not cached");
		} else {
			cachedWorkspaceHostname = getHostUrl();
			return cachedWorkspaceHostname;
		}
	} catch (error) {
		throw new Error(`Unable to determine Databricks workspace hostname: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}
const LOG_SSE_EVENTS = process.env.LOG_SSE_EVENTS === "true";
const databricksFetch = async (input, init) => {
	const url = input.toString();
	if (init?.body) try {
		const requestBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
		console.log("Databricks request:", JSON.stringify({
			url,
			method: init.method || "POST",
			body: requestBody
		}));
	} catch (_e) {
		console.log("Databricks request (raw):", {
			url,
			method: init.method || "POST",
			body: init.body
		});
	}
	const response = await fetch(url, init);
	if (LOG_SSE_EVENTS && response.body) {
		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson")) {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let eventCounter = 0;
			const loggingStream = new ReadableStream({
				async pull(controller) {
					const { done, value } = await reader.read();
					if (done) {
						console.log("[SSE] Stream ended");
						controller.close();
						return;
					}
					const lines = decoder.decode(value, { stream: true }).split("\n").filter((line) => line.trim());
					for (const line of lines) {
						eventCounter++;
						if (line.startsWith("data:")) {
							const data = line.slice(5).trim();
							try {
								const parsed = JSON.parse(data);
								console.log(`[SSE #${eventCounter}]`, JSON.stringify(parsed));
							} catch {
								console.log(`[SSE #${eventCounter}] (raw)`, data);
							}
						} else if (line.trim()) console.log(`[SSE #${eventCounter}] (line)`, line);
					}
					controller.enqueue(value);
				},
				cancel() {
					reader.cancel();
				}
			});
			return new Response(loggingStream, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
		}
	}
	return response;
};
let oauthProviderCache = null;
let oauthProviderCacheTime = 0;
const PROVIDER_CACHE_DURATION = 300 * 1e3;
const API_PROXY = process.env.API_PROXY;
async function getOrCreateDatabricksProvider() {
	if (oauthProviderCache && Date.now() - oauthProviderCacheTime < PROVIDER_CACHE_DURATION) {
		console.log("Using cached OAuth provider");
		return oauthProviderCache;
	}
	console.log("Creating new OAuth provider");
	await getProviderToken();
	const provider = createDatabricksProvider({
		baseURL: `${await getWorkspaceHostname()}/serving-endpoints`,
		formatUrl: ({ baseUrl, path }) => API_PROXY ?? `${baseUrl}${path}`,
		fetch: async (...[input, init]) => {
			const currentToken = await getProviderToken();
			const headers = new Headers(init?.headers);
			headers.set("Authorization", `Bearer ${currentToken}`);
			return databricksFetch(input, {
				...init,
				headers
			});
		}
	});
	oauthProviderCache = provider;
	oauthProviderCacheTime = Date.now();
	return provider;
}
const endpointDetailsCache = /* @__PURE__ */ new Map();
const ENDPOINT_DETAILS_CACHE_DURATION = 300 * 1e3;
const getEndpointDetails = async (servingEndpoint) => {
	const cached = endpointDetailsCache.get(servingEndpoint);
	if (cached && Date.now() - cached.timestamp < ENDPOINT_DETAILS_CACHE_DURATION) return cached;
	const currentToken = await getProviderToken();
	const hostname = await getWorkspaceHostname();
	const headers = new Headers();
	headers.set("Authorization", `Bearer ${currentToken}`);
	const returnValue = {
		task: (await (await databricksFetch(`${hostname}/api/2.0/serving-endpoints/${servingEndpoint}`, {
			method: "GET",
			headers
		})).json()).task,
		timestamp: Date.now()
	};
	endpointDetailsCache.set(servingEndpoint, returnValue);
	return returnValue;
};
var OAuthAwareProvider = class {
	modelCache = /* @__PURE__ */ new Map();
	CACHE_DURATION = 300 * 1e3;
	async languageModel(id) {
		const cached = this.modelCache.get(id);
		if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
			console.log(`Using cached model for ${id}`);
			return cached.model;
		}
		if (isFoundationModel(id)) {
			console.log(`[Provider] Using Foundation Model: ${id}`);
			const model = await getFoundationModel(id);
			this.modelCache.set(id, {
				model,
				timestamp: Date.now()
			});
			return model;
		}
		const provider = await getOrCreateDatabricksProvider();
		const wrappedModel = wrapLanguageModel({
			model: await (async () => {
				if (API_PROXY) return provider.responses(id);
				if (id === "title-model" || id === "artifact-model") return provider.chatCompletions("databricks-meta-llama-3-3-70b-instruct");
				if (!process.env.DATABRICKS_SERVING_ENDPOINT) throw new Error("Please set the DATABRICKS_SERVING_ENDPOINT environment variable to the name of an agent serving endpoint");
				const servingEndpoint = process.env.DATABRICKS_SERVING_ENDPOINT;
				const endpointDetails = await getEndpointDetails(servingEndpoint);
				console.log(`Creating fresh model for ${id}`);
				switch (endpointDetails.task) {
					case "agent/v2/chat": return provider.chatAgent(servingEndpoint);
					case "agent/v1/responses":
					case "agent/v2/responses": return provider.responses(servingEndpoint);
					case "llm/v1/chat": return provider.chatCompletions(servingEndpoint);
					default: return provider.responses(servingEndpoint);
				}
			})(),
			middleware: [extractReasoningMiddleware({ tagName: "think" })]
		});
		this.modelCache.set(id, {
			model: wrappedModel,
			timestamp: Date.now()
		});
		return wrappedModel;
	}
};
const providerInstance = new OAuthAwareProvider();
function getDatabricksServerProvider() {
	return providerInstance;
}

//#endregion
export { getDefaultFoundationModel as a, FOUNDATION_MODELS as i, databricksFetch as n, isFoundationModel as o, getDatabricksServerProvider as r, OAuthAwareProvider as t };