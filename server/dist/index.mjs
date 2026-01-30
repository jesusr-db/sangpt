import { n as isDatabaseAvailable } from "./connection-pool-CIODZxSg.mjs";
import "./src-BaHhVWSg.mjs";
import { r as getAuthSession } from "./src-pe6ovBD5.mjs";
import { A as updateChatVisiblityById, C as getProjectsByUserId, D as saveFileUpload, E as saveChat, F as ChatSDKError, M as updateProjectContext, N as convertToUIMessages, O as saveMessages, P as generateUUID, S as getProjectFiles, T as removeFileFromProject, _ as getFileUploadsByChatId, a as addChatToProject, b as getProjectById, c as createProject, d as deleteMessagesByChatIdAfterTimestamp, f as deleteProject, g as getChatsByUserId, h as getChatsByProjectId, i as checkChatAccess, j as updateProject, k as updateChatLastContextById, l as deleteChatById, m as getChatById, n as postRequestBodySchema, o as addFileToProject, p as deleteProjectContext, r as StreamCache, s as addProjectContext, t as myProvider, u as deleteFileUpload, v as getMessageById, w as removeChatFromProject, x as getProjectContexts, y as getMessagesByChatId } from "./src-CIuo9GFE.mjs";
import "./src-CqvC4Bjf.mjs";
import { a as getDefaultFoundationModel, i as FOUNDATION_MODELS } from "./src-BIJIyhE4.mjs";
import dotenv from "dotenv";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import cors from "cors";
import { convertToModelMessages, createUIMessageStream, generateText, pipeUIMessageStreamToResponse, streamText } from "ai";
import { z } from "zod";
import * as os$1 from "os";
import { DATABRICKS_TOOL_CALL_ID, DATABRICKS_TOOL_DEFINITION, extractApprovalStatus } from "@databricks/ai-sdk-provider";
import * as fs from "fs/promises";
import * as path$1 from "path";
import fileUpload from "express-fileupload";

//#region src/env.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename);
if (!process.env.TEST_MODE) dotenv.config({ path: path.resolve(__dirname$1, "../..", ".env") });

//#endregion
//#region src/middleware/auth.ts
/**
* Middleware to authenticate requests and attach session to request object
*/
async function authMiddleware(req, _res, next) {
	try {
		req.session = await getAuthSession({ getRequestHeader: (name) => req.headers[name.toLowerCase()] }) || void 0;
		next();
	} catch (error) {
		console.error("Auth middleware error:", error);
		next(error);
	}
}
/**
* Middleware to require authentication - returns 401 if no session
*/
function requireAuth(req, res, next) {
	if (!req.session?.user) {
		const response = new ChatSDKError("unauthorized:chat").toResponse();
		return res.status(response.status).json(response.json);
	}
	next();
}
async function requireChatAccess(req, res, next) {
	const { id } = req.params;
	if (!id) {
		console.error("Chat access middleware error: no chat ID provided", req.params);
		const response = new ChatSDKError("bad_request:api").toResponse();
		return res.status(response.status).json(response.json);
	}
	const { allowed, reason } = await checkChatAccess(id, req.session?.user.id);
	if (!allowed) {
		console.error("Chat access middleware error: user does not have access to chat", reason);
		const response = new ChatSDKError("forbidden:chat", reason).toResponse();
		return res.status(response.status).json(response.json);
	}
	next();
}

//#endregion
//#region src/services/file-processor.ts
var FileProcessor = class {
	static MAX_FILE_SIZE = 10 * 1024 * 1024;
	static ALLOWED_EXTENSIONS = [
		".txt",
		".md",
		".py",
		".js",
		".jsx",
		".ts",
		".tsx",
		".json",
		".csv",
		".jpg",
		".jpeg",
		".png",
		".pdf",
		".docx"
	];
	/**
	* Process an uploaded file and extract its content
	*/
	static async processFile(filePath, originalName, mimeType) {
		const fileExtension = path$1.extname(originalName).toLowerCase();
		if (!this.ALLOWED_EXTENSIONS.includes(fileExtension)) throw new Error(`File type ${fileExtension} is not supported`);
		const stats = await fs.stat(filePath);
		if (stats.size > this.MAX_FILE_SIZE) throw new Error(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
		let extractedContent = "";
		let metadata = {
			extension: fileExtension,
			originalSize: stats.size,
			processedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
		let base64Content;
		switch (fileExtension) {
			case ".txt":
			case ".md":
			case ".py":
			case ".js":
			case ".jsx":
			case ".ts":
			case ".tsx":
			case ".json":
			case ".csv":
				extractedContent = await fs.readFile(filePath, "utf-8");
				metadata.lineCount = extractedContent.split("\n").length;
				break;
			case ".jpg":
			case ".jpeg":
			case ".png":
				base64Content = (await fs.readFile(filePath)).toString("base64");
				extractedContent = `[Image: ${originalName}]`;
				metadata.isImage = true;
				metadata.base64Size = base64Content.length;
				break;
			case ".pdf":
				try {
					extractedContent = `[PDF File: ${originalName}]`;
					metadata.isPDF = true;
					metadata.note = "PDF text extraction is temporarily disabled. File stored successfully.";
					try {
						const pdfBuffer = await fs.readFile(filePath);
						const pdfParseModule = await import("pdf-parse").catch(() => null);
						if (pdfParseModule) {
							const pdfParse = pdfParseModule.default || pdfParseModule;
							if (typeof pdfParse === "function") {
								const pdfData = await pdfParse(pdfBuffer);
								if (pdfData && pdfData.text) {
									extractedContent = pdfData.text;
									metadata.pageCount = pdfData.numpages;
									metadata.pdfInfo = pdfData.info;
									delete metadata.note;
								}
							}
						}
					} catch (parseError) {
						console.log("PDF parsing unavailable, using placeholder content");
					}
				} catch (error) {
					console.error("Error processing PDF:", error);
					extractedContent = `[PDF File: ${originalName} - Content extraction failed]`;
					metadata.isPDF = true;
					metadata.error = "Content extraction failed";
				}
				break;
			case ".docx":
				try {
					extractedContent = `[Word Document: ${originalName}]`;
					metadata.isDocx = true;
					try {
						const mammothModule = await import("mammoth").catch(() => null);
						if (mammothModule) {
							const result = await mammothModule.extractRawText({ path: filePath });
							if (result && result.value) {
								extractedContent = result.value;
								metadata.messages = result.messages;
							}
						}
					} catch (parseError) {
						console.log("DOCX parsing unavailable, using placeholder content");
						metadata.note = "Word document text extraction is temporarily disabled. File stored successfully.";
					}
				} catch (error) {
					console.error("Error processing DOCX:", error);
					extractedContent = `[Word Document: ${originalName} - Content extraction failed]`;
					metadata.isDocx = true;
					metadata.error = "Content extraction failed";
				}
				break;
			default: throw new Error(`Unsupported file type: ${fileExtension}`);
		}
		return {
			filename: originalName,
			contentType: mimeType,
			fileSize: stats.size,
			extractedContent,
			metadata,
			base64Content
		};
	}
	/**
	* Truncate content to fit within token limits
	*/
	static truncateContent(content, maxLength = 1e4) {
		if (content.length <= maxLength) return content;
		return content.substring(0, maxLength) + "\n\n[Content truncated...]";
	}
	/**
	* Prepare file content for inclusion in chat context
	*/
	static formatForContext(file) {
		const filename = "filename" in file ? file.filename : file.filename;
		const content = "extractedContent" in file ? file.extractedContent : "";
		return `File: ${filename}\n---\n${this.truncateContent(content)}\n---`;
	}
	/**
	* Check if file type supports vision models
	*/
	static isImageFile(filename) {
		const ext = path$1.extname(filename).toLowerCase();
		return [
			".jpg",
			".jpeg",
			".png"
		].includes(ext);
	}
	/**
	* Clean up temporary file
	*/
	static async cleanupTempFile(filePath) {
		try {
			await fs.unlink(filePath);
		} catch (error) {
			console.error("Failed to cleanup temp file:", error);
		}
	}
};

//#endregion
//#region src/services/session-memory.ts
/**
* Manages in-memory session storage for uploaded files
*/
var SessionMemory = class SessionMemory {
	static instance;
	sessions = /* @__PURE__ */ new Map();
	SESSION_TTL_MS = 1440 * 60 * 1e3;
	cleanupInterval = null;
	constructor() {
		this.startCleanupInterval();
	}
	static getInstance() {
		if (!SessionMemory.instance) SessionMemory.instance = new SessionMemory();
		return SessionMemory.instance;
	}
	/**
	* Add a file to a session
	*/
	addFile(chatId, userId, fileId, file) {
		let session = this.sessions.get(chatId);
		if (!session) {
			session = {
				files: /* @__PURE__ */ new Map(),
				lastActivity: /* @__PURE__ */ new Date()
			};
			this.sessions.set(chatId, session);
		}
		session.files.set(fileId, {
			id: fileId,
			chatId,
			userId,
			file,
			uploadedAt: /* @__PURE__ */ new Date()
		});
		session.lastActivity = /* @__PURE__ */ new Date();
	}
	/**
	* Get all files for a chat session
	*/
	getSessionFiles(chatId) {
		const session = this.sessions.get(chatId);
		if (!session) return [];
		session.lastActivity = /* @__PURE__ */ new Date();
		return Array.from(session.files.values());
	}
	/**
	* Get a specific file from a session
	*/
	getFile(chatId, fileId) {
		const session = this.sessions.get(chatId);
		if (!session) return;
		session.lastActivity = /* @__PURE__ */ new Date();
		return session.files.get(fileId);
	}
	/**
	* Remove a file from a session
	*/
	removeFile(chatId, fileId) {
		const session = this.sessions.get(chatId);
		if (!session) return false;
		const deleted = session.files.delete(fileId);
		session.lastActivity = /* @__PURE__ */ new Date();
		if (session.files.size === 0) this.sessions.delete(chatId);
		return deleted;
	}
	/**
	* Clear all files for a session
	*/
	clearSession(chatId) {
		this.sessions.delete(chatId);
	}
	/**
	* Get context string for all files in a session
	*/
	getContextString(chatId, maxFiles = 10) {
		const files = this.getSessionFiles(chatId);
		if (files.length === 0) return "";
		const contextParts = files.slice(0, maxFiles).map((sf) => FileProcessor.formatForContext(sf.file));
		if (files.length > maxFiles) contextParts.push(`\n[${files.length - maxFiles} additional files not shown]`);
		return contextParts.join("\n\n");
	}
	/**
	* Find files by name pattern in a session
	*/
	findFilesByName(chatId, pattern) {
		const files = this.getSessionFiles(chatId);
		const regex = new RegExp(pattern, "i");
		return files.filter((sf) => regex.test(sf.file.filename));
	}
	/**
	* Get files that contain specific content
	*/
	searchFilesContent(chatId, searchTerm) {
		const files = this.getSessionFiles(chatId);
		const regex = new RegExp(searchTerm, "i");
		return files.filter((sf) => regex.test(sf.file.extractedContent) || regex.test(sf.file.filename));
	}
	/**
	* Clean up expired sessions
	*/
	cleanupExpiredSessions() {
		const now = /* @__PURE__ */ new Date();
		const expired = [];
		for (const [chatId, session] of this.sessions.entries()) if (now.getTime() - session.lastActivity.getTime() > this.SESSION_TTL_MS) expired.push(chatId);
		for (const chatId of expired) {
			console.log(`Cleaning up expired session: ${chatId}`);
			this.sessions.delete(chatId);
		}
	}
	/**
	* Start periodic cleanup of expired sessions
	*/
	startCleanupInterval() {
		this.cleanupInterval = setInterval(() => {
			this.cleanupExpiredSessions();
		}, 3600 * 1e3);
	}
	/**
	* Stop the cleanup interval (for graceful shutdown)
	*/
	stopCleanup() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}
	/**
	* Get session statistics
	*/
	getStats() {
		let totalFiles = 0;
		let oldestSession = null;
		for (const session of this.sessions.values()) {
			totalFiles += session.files.size;
			if (!oldestSession || session.lastActivity < oldestSession) oldestSession = session.lastActivity;
		}
		return {
			totalSessions: this.sessions.size,
			totalFiles,
			oldestSession
		};
	}
};

//#endregion
//#region src/services/project-session-memory.ts
/**
* Extends SessionMemory to support project-level file storage and context inheritance
*/
var ProjectSessionMemory = class ProjectSessionMemory extends SessionMemory {
	static projectInstance;
	projectContexts = /* @__PURE__ */ new Map();
	chatToProject = /* @__PURE__ */ new Map();
	constructor() {
		super();
	}
	static getInstance() {
		if (!ProjectSessionMemory.projectInstance) ProjectSessionMemory.projectInstance = new ProjectSessionMemory();
		return ProjectSessionMemory.projectInstance;
	}
	/**
	* Initialize a chat with project context
	*/
	initializeChatWithProject(chatId, projectId) {
		this.chatToProject.set(chatId, projectId);
		const projectContext = this.projectContexts.get(projectId);
		if (projectContext) for (const [fileId, file] of projectContext.files);
	}
	/**
	* Add a file to a project (shared across all project chats)
	*/
	addProjectFile(projectId, fileId, file) {
		let context = this.projectContexts.get(projectId);
		if (!context) {
			context = {
				files: /* @__PURE__ */ new Map(),
				instructions: [],
				lastActivity: /* @__PURE__ */ new Date()
			};
			this.projectContexts.set(projectId, context);
		}
		context.files.set(fileId, file);
		context.lastActivity = /* @__PURE__ */ new Date();
	}
	/**
	* Get all files for a project
	*/
	getProjectFiles(projectId) {
		const context = this.projectContexts.get(projectId);
		if (!context) return [];
		context.lastActivity = /* @__PURE__ */ new Date();
		return Array.from(context.files.values());
	}
	/**
	* Remove a file from a project
	*/
	removeProjectFile(projectId, fileId) {
		const context = this.projectContexts.get(projectId);
		if (!context) return false;
		const deleted = context.files.delete(fileId);
		context.lastActivity = /* @__PURE__ */ new Date();
		if (context.files.size === 0 && context.instructions.length === 0) this.projectContexts.delete(projectId);
		return deleted;
	}
	/**
	* Add project instructions/context
	*/
	addProjectInstructions(projectId, instructions) {
		let context = this.projectContexts.get(projectId);
		if (!context) {
			context = {
				files: /* @__PURE__ */ new Map(),
				instructions: [],
				lastActivity: /* @__PURE__ */ new Date()
			};
			this.projectContexts.set(projectId, context);
		}
		context.instructions.push(instructions);
		context.lastActivity = /* @__PURE__ */ new Date();
	}
	/**
	* Get project instructions
	*/
	getProjectInstructions(projectId) {
		return this.projectContexts.get(projectId)?.instructions || [];
	}
	/**
	* Clear project instructions
	*/
	clearProjectInstructions(projectId) {
		const context = this.projectContexts.get(projectId);
		if (context) {
			context.instructions = [];
			context.lastActivity = /* @__PURE__ */ new Date();
		}
	}
	/**
	* Get context string for a chat, including inherited project context
	*/
	getContextString(chatId, maxFiles = 10) {
		const contextParts = [];
		const projectId = this.chatToProject.get(chatId);
		if (projectId) {
			const projectFiles = this.getProjectFiles(projectId);
			if (projectFiles.length > 0) {
				contextParts.push("=== Project Files ===");
				const limitedProjectFiles = projectFiles.slice(0, Math.floor(maxFiles / 2));
				for (const file of limitedProjectFiles) contextParts.push(this.formatFileForContext(file));
				if (projectFiles.length > limitedProjectFiles.length) contextParts.push(`[${projectFiles.length - limitedProjectFiles.length} additional project files not shown]`);
			}
		}
		const chatFiles = this.getSessionFiles(chatId);
		if (chatFiles.length > 0) {
			if (contextParts.length > 0) contextParts.push("\n=== Chat Files ===");
			const remainingSlots = maxFiles - (contextParts.length > 0 ? Math.floor(maxFiles / 2) : 0);
			const limitedChatFiles = chatFiles.slice(0, remainingSlots);
			for (const sf of limitedChatFiles) contextParts.push(this.formatFileForContext(sf.file));
			if (chatFiles.length > limitedChatFiles.length) contextParts.push(`[${chatFiles.length - limitedChatFiles.length} additional chat files not shown]`);
		}
		return contextParts.join("\n\n");
	}
	/**
	* Format a file for context inclusion
	*/
	formatFileForContext(file) {
		const parts = [];
		parts.push(`File: ${file.filename}`);
		parts.push(`Type: ${file.contentType}`);
		parts.push(`Size: ${file.fileSize} bytes`);
		if (file.extractedContent) {
			const maxContentLength = 5e3;
			let content = file.extractedContent;
			if (content.length > maxContentLength) content = content.substring(0, maxContentLength) + "...[truncated]";
			parts.push(`Content:\n${content}`);
		}
		return parts.join("\n");
	}
	/**
	* Search for files across both project and chat contexts
	*/
	searchAllFiles(chatId, searchTerm) {
		const results = [];
		const regex = new RegExp(searchTerm, "i");
		const projectId = this.chatToProject.get(chatId);
		if (projectId) {
			const projectFiles = this.getProjectFiles(projectId);
			for (const file of projectFiles) if (regex.test(file.extractedContent) || regex.test(file.filename)) results.push(file);
		}
		const chatFiles = this.searchFilesContent(chatId, searchTerm);
		for (const sf of chatFiles) results.push(sf.file);
		return results;
	}
	/**
	* Clear all project context
	*/
	clearProjectContext(projectId) {
		this.projectContexts.delete(projectId);
		const affectedChats = [];
		for (const [chatId, pid] of this.chatToProject.entries()) if (pid === projectId) affectedChats.push(chatId);
		for (const chatId of affectedChats) this.chatToProject.delete(chatId);
	}
	/**
	* Get comprehensive statistics including project data
	*/
	getExtendedStats() {
		const baseStats = this.getStats();
		let totalProjectFiles = 0;
		for (const context of this.projectContexts.values()) totalProjectFiles += context.files.size;
		return {
			...baseStats,
			totalProjects: this.projectContexts.size,
			totalProjectFiles
		};
	}
	/**
	* Add a ProcessedFile directly to chat context (for backward compatibility)
	*/
	addContext(chatId, file) {
		const fileId = file.id || `temp-${Date.now()}`;
		this.addFile(chatId, "system", fileId, file);
	}
};

//#endregion
//#region src/routes/chat.ts
const chatRouter = Router();
const streamCache = new StreamCache();
const sessionMemory$2 = ProjectSessionMemory.getInstance();
chatRouter.use(authMiddleware);
/**
* POST /api/chat - Send a message and get streaming response
*
* Note: Works in ephemeral mode when database is disabled.
* Streaming continues normally, but no chat/message persistence occurs.
*/
chatRouter.post("/", requireAuth, async (req, res) => {
	const dbAvailable = isDatabaseAvailable();
	if (!dbAvailable) console.log("[Chat] Running in ephemeral mode - no persistence");
	console.log(`CHAT POST REQUEST ${Date.now()}`);
	let requestBody;
	try {
		requestBody = postRequestBodySchema.parse(req.body);
	} catch (_) {
		console.error("Error parsing request body:", _);
		const response = new ChatSDKError("bad_request:api").toResponse();
		return res.status(response.status).json(response.json);
	}
	try {
		const { id, message, selectedChatModel, selectedVisibilityType, projectId } = requestBody;
		const session = req.session;
		if (!session) {
			const response = new ChatSDKError("unauthorized:chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		const { chat, allowed, reason } = await checkChatAccess(id, session?.user.id);
		if (reason !== "not_found" && !allowed) {
			const response = new ChatSDKError("forbidden:chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (!chat) {
			if (isDatabaseAvailable() && message) {
				const title = await generateTitleFromUserMessage({ message });
				await saveChat({
					id,
					userId: session.user.id,
					title,
					visibility: selectedVisibilityType,
					projectId
				});
			}
		} else if (chat.userId !== session.user.id) {
			const response = new ChatSDKError("forbidden:chat").toResponse();
			return res.status(response.status).json(response.json);
		}
		const messagesFromDb = await getMessagesByChatId({ id });
		const previousMessages = !dbAvailable || !message && requestBody.previousMessages ? requestBody.previousMessages ?? [] : convertToUIMessages(messagesFromDb);
		let uiMessages;
		if (message) {
			uiMessages = [...previousMessages, message];
			await saveMessages({ messages: [{
				chatId: id,
				id: message.id,
				role: "user",
				parts: message.parts,
				attachments: [],
				createdAt: /* @__PURE__ */ new Date()
			}] });
		} else {
			uiMessages = previousMessages;
			if (dbAvailable && requestBody.previousMessages) {
				const assistantMessages = requestBody.previousMessages.filter((m) => m.role === "assistant");
				if (assistantMessages.length > 0) {
					await saveMessages({ messages: assistantMessages.map((m) => ({
						chatId: id,
						id: m.id,
						role: m.role,
						parts: m.parts,
						attachments: [],
						createdAt: m.metadata?.createdAt ? new Date(m.metadata.createdAt) : /* @__PURE__ */ new Date()
					})) });
					const lastPart = assistantMessages.at(-1)?.parts?.at(-1);
					if ((lastPart?.type === "tool-databricks-tool-call" && lastPart.output ? extractApprovalStatus(lastPart.output) : void 0) === false) {
						res.end();
						return;
					}
				}
			}
		}
		streamCache.clearActiveStream(id);
		let finalUsage;
		const streamId = generateUUID();
		sessionMemory$2.getContextString(id);
		let projectContext = null;
		let projectFileContext = null;
		if (chat?.projectId) try {
			sessionMemory$2.initializeChatWithProject(id, chat.projectId);
			const contexts = await getProjectContexts({ projectId: chat.projectId });
			if (contexts.length > 0) {
				projectContext = contexts.map((ctx) => `[${ctx.contextType}]: ${ctx.content}`).join("\n\n");
				for (const ctx of contexts) sessionMemory$2.addProjectInstructions(chat.projectId, ctx.content);
			}
			const projectFiles = await getProjectFiles({ projectId: chat.projectId });
			if (projectFiles.length > 0) {
				for (const file of projectFiles) sessionMemory$2.addProjectFile(chat.projectId, file.id, {
					id: file.id,
					filename: file.filename,
					contentType: file.contentType,
					fileSize: file.fileSize,
					extractedContent: file.extractedContent || "",
					metadata: file.metadata || {},
					createdAt: file.createdAt
				});
				projectFileContext = projectFiles.map((f) => `- ${f.filename} (${f.contentType}, ${f.fileSize} bytes)`).join("\n");
			}
		} catch (error) {
			console.warn("Failed to fetch project context:", error);
		}
		let messagesForModel = convertToModelMessages(uiMessages);
		const systemMessages = [];
		if (projectContext) systemMessages.push({
			role: "system",
			content: `Project Context and Instructions:\n\n${projectContext}`
		});
		const allFileContext = sessionMemory$2.getContextString(id);
		if (allFileContext || projectFileContext) {
			let fileMessage = "You have access to the following files:\n\n";
			if (projectFileContext) fileMessage += "Project Files:\n" + projectFileContext + "\n\n";
			if (allFileContext) fileMessage += "Chat Files:\n" + allFileContext;
			fileMessage += "\n\nYou can reference these files by name when responding to user queries.";
			systemMessages.push({
				role: "system",
				content: fileMessage
			});
		}
		if (systemMessages.length > 0) messagesForModel = [...systemMessages, ...messagesForModel];
		const result = streamText({
			model: await myProvider.languageModel(selectedChatModel),
			messages: messagesForModel,
			onFinish: ({ usage }) => {
				finalUsage = usage;
			},
			tools: { [DATABRICKS_TOOL_CALL_ID]: DATABRICKS_TOOL_DEFINITION }
		});
		pipeUIMessageStreamToResponse({
			stream: createUIMessageStream({
				execute: async ({ writer }) => {
					writer.merge(result.toUIMessageStream({
						originalMessages: uiMessages,
						generateMessageId: generateUUID,
						sendReasoning: true,
						sendSources: true,
						onError: (error) => {
							console.error("Stream error:", error);
							const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
							writer.write({
								type: "data-error",
								data: errorMessage
							});
							return errorMessage;
						}
					}));
				},
				onFinish: async ({ responseMessage }) => {
					console.log("Finished message stream! Saving message...", JSON.stringify(responseMessage, null, 2));
					await saveMessages({ messages: [{
						id: responseMessage.id,
						role: responseMessage.role,
						parts: responseMessage.parts,
						createdAt: /* @__PURE__ */ new Date(),
						attachments: [],
						chatId: id
					}] });
					if (finalUsage) try {
						await updateChatLastContextById({
							chatId: id,
							context: finalUsage
						});
					} catch (err) {
						console.warn("Unable to persist last usage for chat", id, err);
					}
					streamCache.clearActiveStream(id);
				}
			}),
			response: res,
			consumeSseStream({ stream }) {
				streamCache.storeStream({
					streamId,
					chatId: id,
					stream
				});
			}
		});
	} catch (error) {
		if (error instanceof ChatSDKError) {
			const response$1 = error.toResponse();
			return res.status(response$1.status).json(response$1.json);
		}
		console.error("Unhandled error in chat API:", error);
		const response = new ChatSDKError("offline:chat").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* DELETE /api/chat?id=:id - Delete a chat
*/
chatRouter.delete("/:id", [requireAuth, requireChatAccess], async (req, res) => {
	const { id } = req.params;
	const deletedChat = await deleteChatById({ id });
	return res.status(200).json(deletedChat);
});
/**
* GET /api/chat/:id
*/
chatRouter.get("/:id", [requireAuth, requireChatAccess], async (req, res) => {
	const { id } = req.params;
	const { chat } = await checkChatAccess(id, req.session?.user.id);
	return res.status(200).json(chat);
});
/**
* GET /api/chat/:id/stream - Resume a stream
*/
chatRouter.get("/:id/stream", [requireAuth], async (req, res) => {
	const { id: chatId } = req.params;
	const cursor = req.headers["x-resume-stream-cursor"];
	console.log(`[Stream Resume] Cursor: ${cursor}`);
	console.log(`[Stream Resume] GET request for chat ${chatId}`);
	const streamId = streamCache.getActiveStreamId(chatId);
	if (!streamId) {
		console.log(`[Stream Resume] No active stream for chat ${chatId}`);
		const response = new ChatSDKError("empty:stream").toResponse();
		return res.status(response.status).json(response.json);
	}
	const { allowed, reason } = await checkChatAccess(chatId, req.session?.user.id);
	if (reason === "not_found") console.log(`[Stream Resume] Resuming stream for temporary chat ${chatId} (not yet in DB)`);
	else if (!allowed) {
		console.log(`[Stream Resume] User ${req.session?.user.id} does not have access to chat ${chatId} (reason: ${reason})`);
		const response = new ChatSDKError("forbidden:chat", reason).toResponse();
		return res.status(response.status).json(response.json);
	}
	const stream = streamCache.getStream(streamId, { cursor: cursor ? Number.parseInt(cursor) : void 0 });
	if (!stream) {
		console.log(`[Stream Resume] No stream found for ${streamId}`);
		const response = new ChatSDKError("empty:stream").toResponse();
		return res.status(response.status).json(response.json);
	}
	console.log(`[Stream Resume] Resuming stream ${streamId}`);
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	stream.pipe(res);
	stream.on("error", (error) => {
		console.error("[Stream Resume] Stream error:", error);
		if (!res.headersSent) res.status(500).end();
	});
});
/**
* POST /api/chat/title - Generate title from message
*/
chatRouter.post("/title", requireAuth, async (req, res) => {
	try {
		const { message } = req.body;
		const title = await generateTitleFromUserMessage({ message });
		res.json({ title });
	} catch (error) {
		console.error("Error generating title:", error);
		res.status(500).json({ error: "Failed to generate title" });
	}
});
/**
* PATCH /api/chat/:id/visibility - Update chat visibility
*/
chatRouter.patch("/:id/visibility", [requireAuth, requireChatAccess], async (req, res) => {
	try {
		const { id } = req.params;
		const { visibility } = req.body;
		if (!visibility || !["public", "private"].includes(visibility)) return res.status(400).json({ error: "Invalid visibility type" });
		await updateChatVisiblityById({
			chatId: id,
			visibility
		});
		res.json({ success: true });
	} catch (error) {
		console.error("Error updating visibility:", error);
		res.status(500).json({ error: "Failed to update visibility" });
	}
});
async function generateTitleFromUserMessage({ message }) {
	const { text: title } = await generateText({
		model: await myProvider.languageModel("title-model"),
		system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons. do not include other expository content ("I'll help...")`,
		prompt: JSON.stringify(message)
	});
	return title;
}

//#endregion
//#region src/routes/history.ts
const historyRouter = Router();
historyRouter.use(authMiddleware);
/**
* GET /api/history - Get chat history for authenticated user
*/
historyRouter.get("/", requireAuth, async (req, res) => {
	console.log("[/api/history] Handler called");
	const dbAvailable = isDatabaseAvailable();
	console.log("[/api/history] Database available:", dbAvailable);
	if (!dbAvailable) {
		console.log("[/api/history] Returning 204 No Content");
		return res.status(204).end();
	}
	const session = req.session;
	if (!session) {
		const response = new ChatSDKError("unauthorized:chat").toResponse();
		return res.status(response.status).json(response.json);
	}
	const limit = Number.parseInt(req.query.limit || "10");
	const startingAfter = req.query.starting_after;
	const endingBefore = req.query.ending_before;
	if (startingAfter && endingBefore) {
		const response = new ChatSDKError("bad_request:api", "Only one of starting_after or ending_before can be provided.").toResponse();
		return res.status(response.status).json(response.json);
	}
	try {
		const chats = await getChatsByUserId({
			id: session.user.id,
			limit,
			startingAfter: startingAfter ?? null,
			endingBefore: endingBefore ?? null
		});
		res.json(chats);
	} catch (error) {
		console.error("[/api/history] Error in handler:", error);
		res.status(500).json({ error: "Failed to fetch chat history" });
	}
});

//#endregion
//#region src/routes/session.ts
const sessionRouter = Router();
sessionRouter.use(authMiddleware);
/**
* GET /api/session - Get current user session
*/
sessionRouter.get("/", async (req, res) => {
	console.log("GET /api/session", req.session);
	const session = req.session;
	if (!session?.user) return res.json({ user: null });
	const clientSession = { user: {
		email: session.user.email,
		name: session.user.name,
		preferredUsername: session.user.preferredUsername
	} };
	res.json(clientSession);
});

//#endregion
//#region src/routes/messages.ts
const messagesRouter = Router();
messagesRouter.use(authMiddleware);
/**
* GET /api/messages/:id - Get messages by chat ID
*/
messagesRouter.get("/:id", [requireAuth, requireChatAccess], async (req, res) => {
	const { id } = req.params;
	if (!id) return;
	try {
		const messages = await getMessagesByChatId({ id });
		return res.status(200).json(messages);
	} catch (error) {
		console.error("Error getting messages by chat ID:", error);
		return res.status(500).json({ error: "Failed to get messages" });
	}
});
/**
* DELETE /api/messages/:id/trailing - Delete trailing messages after a specific message
*/
messagesRouter.delete("/:id/trailing", [requireAuth], async (req, res) => {
	try {
		const dbAvailable = isDatabaseAvailable();
		console.log("[/api/messages/:id/trailing] Database available:", dbAvailable);
		if (!dbAvailable) {
			console.log("[/api/messages/:id/trailing] Returning 204 No Content");
			return res.status(204).end();
		}
		const { id } = req.params;
		const [message] = await getMessageById({ id });
		if (!message) {
			const response = new ChatSDKError("not_found:message").toResponse();
			return res.status(response.status).json(response.json);
		}
		const { allowed, reason } = await checkChatAccess(message.chatId, req.session?.user.id);
		if (!allowed) {
			const response = new ChatSDKError("forbidden:chat", reason).toResponse();
			return res.status(response.status).json(response.json);
		}
		await deleteMessagesByChatIdAfterTimestamp({
			chatId: message.chatId,
			timestamp: message.createdAt
		});
		res.json({ success: true });
	} catch (error) {
		console.error("Error deleting trailing messages:", error);
		res.status(500).json({ error: "Failed to delete messages" });
	}
});

//#endregion
//#region src/routes/config.ts
const configRouter = Router();
/**
* GET /api/config - Get application configuration
* Returns feature flags based on environment configuration
*/
configRouter.get("/", (_req, res) => {
	res.json({
		features: { chatHistory: isDatabaseAvailable() },
		availableModels: FOUNDATION_MODELS,
		defaultModel: getDefaultFoundationModel()
	});
});

//#endregion
//#region src/routes/files.ts
const filesRouter = Router();
filesRouter.use(fileUpload({
	limits: { fileSize: 10 * 1024 * 1024 },
	useTempFiles: true,
	tempFileDir: os$1.tmpdir()
}));
filesRouter.use(authMiddleware);
const sessionMemory$1 = ProjectSessionMemory.getInstance();
/**
* POST /api/files/upload - Upload a file to a chat session
*/
filesRouter.post("/upload", requireAuth, async (req, res) => {
	try {
		const { chatId } = req.body;
		const userId = req.session?.user.id;
		if (!chatId) {
			const response = new ChatSDKError("bad_request:api", "Chat ID is required").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (!req.files || Object.keys(req.files).length === 0) {
			const response = new ChatSDKError("bad_request:api", "No files were uploaded").toResponse();
			return res.status(response.status).json(response.json);
		}
		const uploadedFile = Array.isArray(req.files.file) ? req.files.file[0] : req.files.file;
		if (!uploadedFile) {
			const response = new ChatSDKError("bad_request:api", "File not found in request").toResponse();
			return res.status(response.status).json(response.json);
		}
		const processedFile = await FileProcessor.processFile(uploadedFile.tempFilePath, uploadedFile.name, uploadedFile.mimetype);
		const fileId = generateUUID();
		sessionMemory$1.addFile(chatId, userId, fileId, processedFile);
		if (isDatabaseAvailable()) try {
			const { checkChatAccess: checkChatAccess$1 } = await import("./src-DLwhYGuN.mjs");
			const { chat } = await checkChatAccess$1(chatId, userId);
			if (chat) await saveFileUpload({
				id: fileId,
				chatId,
				userId,
				filename: processedFile.filename,
				contentType: processedFile.contentType,
				fileSize: processedFile.fileSize,
				extractedContent: processedFile.extractedContent,
				metadata: processedFile.metadata
			});
			else console.log(`Chat ${chatId} not in database yet, file stored in session memory only`);
		} catch (dbError) {
			console.log("Could not save file to database, stored in session memory:", dbError);
		}
		await FileProcessor.cleanupTempFile(uploadedFile.tempFilePath);
		res.json({
			id: fileId,
			filename: processedFile.filename,
			contentType: processedFile.contentType,
			fileSize: processedFile.fileSize,
			metadata: processedFile.metadata,
			hasContent: !!processedFile.extractedContent,
			isImage: FileProcessor.isImageFile(processedFile.filename)
		});
	} catch (error) {
		console.error("File upload error:", error);
		const response = new ChatSDKError("bad_request:api", error instanceof Error ? error.message : "Failed to upload file").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId - Get all files for a chat session
*/
filesRouter.get("/:chatId", requireAuth, async (req, res) => {
	try {
		const { chatId } = req.params;
		const sessionFiles = sessionMemory$1.getSessionFiles(chatId);
		let dbFiles = [];
		if (isDatabaseAvailable()) dbFiles = await getFileUploadsByChatId({ chatId });
		const fileMap = /* @__PURE__ */ new Map();
		for (const file of dbFiles) fileMap.set(file.id, {
			id: file.id,
			filename: file.filename,
			contentType: file.contentType,
			fileSize: file.fileSize,
			metadata: file.metadata,
			uploadedAt: file.createdAt,
			hasContent: !!file.extractedContent,
			isImage: FileProcessor.isImageFile(file.filename)
		});
		for (const sessionFile of sessionFiles) fileMap.set(sessionFile.id, {
			id: sessionFile.id,
			filename: sessionFile.file.filename,
			contentType: sessionFile.file.contentType,
			fileSize: sessionFile.file.fileSize,
			metadata: sessionFile.file.metadata,
			uploadedAt: sessionFile.uploadedAt,
			hasContent: !!sessionFile.file.extractedContent,
			isImage: FileProcessor.isImageFile(sessionFile.file.filename)
		});
		const files = Array.from(fileMap.values());
		res.json({ files });
	} catch (error) {
		console.error("Get files error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to retrieve files").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId/:fileId/content - Get file content
*/
filesRouter.get("/:chatId/:fileId/content", requireAuth, async (req, res) => {
	try {
		const { chatId, fileId } = req.params;
		const sessionFile = sessionMemory$1.getFile(chatId, fileId);
		if (sessionFile) return res.json({
			id: fileId,
			filename: sessionFile.file.filename,
			content: sessionFile.file.extractedContent,
			base64Content: sessionFile.file.base64Content,
			metadata: sessionFile.file.metadata
		});
		if (isDatabaseAvailable()) {
			const file = (await getFileUploadsByChatId({ chatId })).find((f) => f.id === fileId);
			if (file) return res.json({
				id: file.id,
				filename: file.filename,
				content: file.extractedContent,
				metadata: file.metadata
			});
		}
		const response = new ChatSDKError("not_found:api", "File not found").toResponse();
		return res.status(response.status).json(response.json);
	} catch (error) {
		console.error("Get file content error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to retrieve file content").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* DELETE /api/files/:chatId/:fileId - Delete a file from session
*/
filesRouter.delete("/:chatId/:fileId", requireAuth, async (req, res) => {
	try {
		const { chatId, fileId } = req.params;
		sessionMemory$1.removeFile(chatId, fileId);
		if (isDatabaseAvailable()) await deleteFileUpload({ id: fileId });
		res.json({ success: true });
	} catch (error) {
		console.error("Delete file error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to delete file").toResponse();
		return res.status(response.status).json(response.json);
	}
});
/**
* GET /api/files/:chatId/context - Get formatted context for all files
*/
filesRouter.get("/:chatId/context", requireAuth, async (req, res) => {
	try {
		const { chatId } = req.params;
		const { maxFiles = 10 } = req.query;
		const context = sessionMemory$1.getContextString(chatId, Number.parseInt(maxFiles));
		res.json({ context });
	} catch (error) {
		console.error("Get context error:", error);
		const response = new ChatSDKError("bad_request:api", "Failed to get file context").toResponse();
		return res.status(response.status).json(response.json);
	}
});

//#endregion
//#region src/routes/projects.ts
const createProjectSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	color: z.string().optional(),
	icon: z.string().optional(),
	metadata: z.record(z.any()).optional()
});
const updateProjectSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	color: z.string().optional(),
	icon: z.string().optional(),
	isActive: z.boolean().optional(),
	metadata: z.record(z.any()).optional()
});
const addContextSchema = z.object({
	contextType: z.enum([
		"instruction",
		"memory",
		"reference"
	]),
	content: z.string().min(1)
});
const updateContextSchema = z.object({ content: z.string().min(1) });
const projectsRouter = Router();
projectsRouter.use(authMiddleware);
projectsRouter.use(fileUpload({
	limits: { fileSize: 10 * 1024 * 1024 },
	useTempFiles: true,
	tempFileDir: os$1.tmpdir()
}));
const sessionMemory = ProjectSessionMemory.getInstance();
projectsRouter.post("/", requireAuth, async (req, res) => {
	try {
		const validatedData = createProjectSchema.parse(req.body);
		const userId = req.session.user.id;
		const project = await createProject({
			userId,
			...validatedData
		});
		if (!project) throw new ChatSDKError("internal:database", "Failed to create project");
		res.json(project);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else if (error instanceof ChatSDKError) res.status(500).json({ error: error.message });
		else res.status(500).json({ error: "Internal server error" });
	}
});
projectsRouter.get("/", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const projects = await getProjectsByUserId({ userId });
		res.json(projects);
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch projects" });
	}
});
projectsRouter.get("/:id", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const project = await getProjectById({
			id: req.params.id,
			userId
		});
		if (!project) throw new ChatSDKError("not_found:project", "Project not found");
		res.json(project);
	} catch (error) {
		if (error instanceof ChatSDKError && error.code === "not_found:project") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to fetch project" });
	}
});
projectsRouter.patch("/:id", requireAuth, async (req, res) => {
	try {
		const validatedData = updateProjectSchema.parse(req.body);
		const userId = req.session.user.id;
		const project = await updateProject({
			id: req.params.id,
			userId,
			...validatedData
		});
		if (!project) throw new ChatSDKError("not_found:project", "Project not found");
		res.json(project);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else if (error instanceof ChatSDKError && error.code === "not_found:project") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to update project" });
	}
});
projectsRouter.delete("/:id", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		if (!await deleteProject({
			id: req.params.id,
			userId
		})) throw new ChatSDKError("not_found:project", "Project not found");
		res.status(204).send();
	} catch (error) {
		if (error instanceof ChatSDKError && error.code === "not_found:project") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to delete project" });
	}
});
projectsRouter.post("/:id/chats/:chatId", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const { id: projectId, chatId } = req.params;
		if (!await getProjectById({
			id: projectId,
			userId
		})) throw new ChatSDKError("not_found:project", "Project not found");
		const chat = await getChatById({ id: chatId });
		if (!chat || chat.userId !== userId) throw new ChatSDKError("not_found:chat", "Chat not found");
		if (!await addChatToProject({
			chatId,
			projectId,
			userId
		})) throw new ChatSDKError("internal:database", "Failed to add chat to project");
		res.json({ success: true });
	} catch (error) {
		if (error instanceof ChatSDKError) {
			const status = error.code.startsWith("not_found") ? 404 : 500;
			res.status(status).json({ error: error.message });
		} else res.status(500).json({ error: "Failed to add chat to project" });
	}
});
projectsRouter.delete("/:id/chats/:chatId", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const { chatId } = req.params;
		if (!await removeChatFromProject({
			chatId,
			userId
		})) throw new ChatSDKError("internal:database", "Failed to remove chat from project");
		res.status(204).send();
	} catch (error) {
		res.status(500).json({ error: "Failed to remove chat from project" });
	}
});
projectsRouter.get("/:id/chats", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const chats = await getChatsByProjectId({
			projectId: req.params.id,
			userId
		});
		res.json(chats);
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch project chats" });
	}
});
projectsRouter.post("/:id/files", requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const { id: projectId } = req.params;
		const { fileId } = req.body;
		if (!fileId) throw new ChatSDKError("bad_request:missing_param", "fileId is required");
		const projectFile = await addFileToProject({
			projectId,
			fileId,
			userId
		});
		if (!projectFile) throw new ChatSDKError("internal:database", "Failed to add file to project");
		res.json(projectFile);
	} catch (error) {
		if (error instanceof ChatSDKError) {
			const status = error.code.startsWith("bad_request") ? 400 : 500;
			res.status(status).json({ error: error.message });
		} else res.status(500).json({ error: "Failed to add file to project" });
	}
});
projectsRouter.get("/:id/files", requireAuth, async (req, res) => {
	try {
		const files = await getProjectFiles({ projectId: req.params.id });
		res.json(files);
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch project files" });
	}
});
projectsRouter.delete("/:id/files/:fileId", requireAuth, async (req, res) => {
	try {
		const { id: projectId, fileId } = req.params;
		if (!await removeFileFromProject({
			projectId,
			fileId
		})) throw new ChatSDKError("internal:database", "Failed to remove file from project");
		sessionMemory.removeProjectFile(projectId, fileId);
		res.status(204).send();
	} catch (error) {
		res.status(500).json({ error: "Failed to remove file from project" });
	}
});
projectsRouter.post("/:id/upload", requireAuth, async (req, res) => {
	try {
		const { id: projectId } = req.params;
		const userId = req.session.user.id;
		const project = await getProjectById(projectId);
		if (!project || project.userId !== userId) {
			const response = new ChatSDKError("forbidden:project", "Access denied to project").toResponse();
			return res.status(response.status).json(response.json);
		}
		if (!req.files || Object.keys(req.files).length === 0) {
			const response = new ChatSDKError("bad_request:api", "No files were uploaded").toResponse();
			return res.status(response.status).json(response.json);
		}
		const uploadedFiles = [];
		const fileArray = Array.isArray(req.files.file) ? req.files.file : [req.files.file];
		for (const file of fileArray) try {
			const tempPath = file.tempFilePath;
			const processedFile = await FileProcessor.processFile({
				filename: file.name,
				contentType: file.mimetype,
				buffer: file.data,
				filePath: tempPath
			});
			const fileId = generateUUID();
			if (isDatabaseAvailable()) {
				await saveFileUpload({
					id: fileId,
					filename: file.name,
					contentType: file.mimetype,
					fileSize: file.size,
					extractedContent: processedFile.extractedContent,
					metadata: processedFile.metadata,
					projectId,
					userId
				});
				await addFileToProject({
					projectId,
					fileId,
					userId
				});
			}
			sessionMemory.addProjectFile(projectId, fileId, {
				id: fileId,
				filename: file.name,
				contentType: file.mimetype,
				fileSize: file.size,
				extractedContent: processedFile.extractedContent,
				metadata: processedFile.metadata || {},
				createdAt: /* @__PURE__ */ new Date()
			});
			uploadedFiles.push({
				id: fileId,
				filename: file.name,
				contentType: file.mimetype,
				fileSize: file.size,
				extractedContent: processedFile.extractedContent,
				projectId
			});
			if (tempPath) try {
				await (await import("fs/promises")).unlink(tempPath);
			} catch (err) {
				console.warn("Failed to clean up temp file:", err);
			}
		} catch (error) {
			console.error(`Failed to process file ${file.name}:`, error);
		}
		if (uploadedFiles.length === 0) {
			const response = new ChatSDKError("internal:processing", "Failed to process any files").toResponse();
			return res.status(response.status).json(response.json);
		}
		res.json({
			files: uploadedFiles,
			projectId
		});
	} catch (error) {
		console.error("Error uploading files to project:", error);
		if (error instanceof ChatSDKError) {
			const response = error.toResponse();
			return res.status(response.status).json(response.json);
		}
		res.status(500).json({ error: "Failed to upload files to project" });
	}
});
projectsRouter.post("/:id/context", requireAuth, async (req, res) => {
	try {
		const validatedData = addContextSchema.parse(req.body);
		const { id: projectId } = req.params;
		const context = await addProjectContext({
			projectId,
			...validatedData
		});
		if (!context) throw new ChatSDKError("internal:database", "Failed to add project context");
		res.json(context);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else res.status(500).json({ error: "Failed to add project context" });
	}
});
projectsRouter.get("/:id/context", requireAuth, async (req, res) => {
	try {
		const contexts = await getProjectContexts({ projectId: req.params.id });
		res.json(contexts);
	} catch (error) {
		res.status(500).json({ error: "Failed to fetch project contexts" });
	}
});
projectsRouter.patch("/:id/context/:contextId", requireAuth, async (req, res) => {
	try {
		const validatedData = updateContextSchema.parse(req.body);
		const { contextId } = req.params;
		const context = await updateProjectContext({
			id: contextId,
			...validatedData
		});
		if (!context) throw new ChatSDKError("not_found:context", "Context not found");
		res.json(context);
	} catch (error) {
		if (error instanceof z.ZodError) res.status(400).json({
			error: "Invalid request data",
			details: error.errors
		});
		else if (error instanceof ChatSDKError && error.code === "not_found:context") res.status(404).json({ error: error.message });
		else res.status(500).json({ error: "Failed to update context" });
	}
});
projectsRouter.delete("/:id/context/:contextId", requireAuth, async (req, res) => {
	try {
		const { contextId } = req.params;
		if (!await deleteProjectContext({ id: contextId })) throw new ChatSDKError("internal:database", "Failed to delete context");
		res.status(204).send();
	} catch (error) {
		res.status(500).json({ error: "Failed to delete context" });
	}
});

//#endregion
//#region src/index.ts
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const isDevelopment = process.env.NODE_ENV !== "production";
const PORT = process.env.CHAT_APP_PORT || process.env.PORT || (isDevelopment ? 3001 : 3e3);
app.use(cors({
	origin: isDevelopment ? "http://localhost:3000" : true,
	credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/ping", (_req, res) => {
	res.status(200).send("pong");
});
app.use("/api/chat", chatRouter);
app.use("/api/history", historyRouter);
app.use("/api/session", sessionRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/config", configRouter);
app.use("/api/files", filesRouter);
app.use("/api/projects", projectsRouter);
if (!isDevelopment) {
	const clientBuildPath = path.join(__dirname, "../../client/dist");
	app.use(express.static(clientBuildPath));
	app.get(/^\/(?!api).*/, (_req, res) => {
		res.sendFile(path.join(clientBuildPath, "index.html"));
	});
}
app.use((err, _req, res, _next) => {
	console.error("Error:", err);
	if (err instanceof ChatSDKError) {
		const response = err.toResponse();
		return res.status(response.status).json(response.json);
	}
	res.status(500).json({
		error: "Internal Server Error",
		message: isDevelopment ? err.message : "An unexpected error occurred"
	});
});
async function startServer() {
	if (process.env.PLAYWRIGHT === "True") {
		console.log("[Test Mode] Starting MSW mock server for API mocking...");
		try {
			const modulePath = path.join(dirname(dirname(__dirname)), "tests", "api-mocking", "api-mock-server.ts");
			console.log("[Test Mode] Attempting to load MSW from:", modulePath);
			const { mockServer } = await import(modulePath);
			mockServer.listen({ onUnhandledRequest: (request) => {
				console.warn(`[MSW] Unhandled ${request.method} request to ${request.url}`);
			} });
			console.log("[Test Mode] MSW mock server started successfully");
			console.log("[Test Mode] Registered handlers:", mockServer.listHandlers().length);
		} catch (error) {
			console.error("[Test Mode] Failed to start MSW:", error);
			console.error("[Test Mode] Error details:", error instanceof Error ? error.stack : error);
		}
	}
	app.listen(PORT, () => {
		console.log(`Backend server is running on http://localhost:${PORT}`);
		console.log(`Environment: ${isDevelopment ? "development" : "production"}`);
	});
}
startServer();
var src_default = app;

//#endregion
export { src_default as default };