import type { LanguageModelV2 } from '@ai-sdk/provider';
import { createDatabricksProvider } from '@databricks/ai-sdk-provider';
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';
import { getDatabricksToken } from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

// List of available Foundation Models
export const FOUNDATION_MODELS = [
  'databricks-dbrx-instruct',
  'databricks-meta-llama-3-3-70b-instruct',
  'databricks-mixtral-8x7b-instruct',
  'databricks-meta-llama-3-1-70b-instruct',
  'databricks-meta-llama-3-1-405b-instruct',
  'databricks-meta-llama-3-2-1b-instruct',
  'databricks-meta-llama-3-2-3b-instruct',
  'databricks-meta-llama-3-2-11b-vision-instruct',
  'databricks-meta-llama-3-2-90b-vision-instruct',
  'databricks-gte-large-en',
  'databricks-bge-large-en',
  'databricks-mpt-7b-instruct',
  'databricks-mpt-30b-instruct',
  'databricks-gpt-5-2',
  'databricks-gpt-4o-mini',
] as const;

export type FoundationModelId = (typeof FOUNDATION_MODELS)[number];

// Model capabilities configuration
export const MODEL_CAPABILITIES = {
  'databricks-dbrx-instruct': {
    name: 'DBRX Instruct',
    description: 'Databricks DBRX model optimized for instruction following',
    maxTokens: 32768,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-meta-llama-3-3-70b-instruct': {
    name: 'Llama 3.3 70B',
    description: 'Meta Llama 3.3 70B instruction model with strong performance',
    maxTokens: 128000,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-mixtral-8x7b-instruct': {
    name: 'Mixtral 8x7B',
    description: 'Mixtral Mixture of Experts model with efficient performance',
    maxTokens: 32768,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-meta-llama-3-1-70b-instruct': {
    name: 'Llama 3.1 70B',
    description: 'Meta Llama 3.1 70B with extended context window',
    maxTokens: 128000,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-meta-llama-3-1-405b-instruct': {
    name: 'Llama 3.1 405B',
    description: 'Meta Llama 3.1 405B - largest and most capable model',
    maxTokens: 128000,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-meta-llama-3-2-1b-instruct': {
    name: 'Llama 3.2 1B',
    description: 'Lightweight Llama 3.2 1B model for fast inference',
    maxTokens: 128000,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-meta-llama-3-2-3b-instruct': {
    name: 'Llama 3.2 3B',
    description: 'Efficient Llama 3.2 3B model with good performance',
    maxTokens: 128000,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-meta-llama-3-2-11b-vision-instruct': {
    name: 'Llama 3.2 11B Vision',
    description: 'Llama 3.2 11B with vision capabilities',
    maxTokens: 128000,
    supportsVision: true,
    supportsTools: true,
  },
  'databricks-meta-llama-3-2-90b-vision-instruct': {
    name: 'Llama 3.2 90B Vision',
    description: 'Large Llama 3.2 90B with vision capabilities',
    maxTokens: 128000,
    supportsVision: true,
    supportsTools: true,
  },
  'databricks-gte-large-en': {
    name: 'GTE Large',
    description: 'General Text Embeddings model for semantic search',
    maxTokens: 8192,
    supportsVision: false,
    supportsTools: false,
  },
  'databricks-bge-large-en': {
    name: 'BGE Large',
    description: 'BAAI General Embedding model for text similarity',
    maxTokens: 8192,
    supportsVision: false,
    supportsTools: false,
  },
  'databricks-mpt-7b-instruct': {
    name: 'MPT 7B',
    description: 'MosaicML MPT 7B instruction-tuned model',
    maxTokens: 65536,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-mpt-30b-instruct': {
    name: 'MPT 30B',
    description: 'MosaicML MPT 30B instruction-tuned model',
    maxTokens: 8192,
    supportsVision: false,
    supportsTools: true,
  },
  'databricks-gpt-5-2': {
    name: 'GPT-5.2',
    description: 'Advanced GPT-5.2 model with superior reasoning capabilities',
    maxTokens: 128000,
    supportsVision: true,
    supportsTools: true,
  },
  'databricks-gpt-4o-mini': {
    name: 'GPT-4o Mini',
    description: 'Efficient GPT-4 Omni mini model for fast inference',
    maxTokens: 128000,
    supportsVision: true,
    supportsTools: true,
  },
} as const;

// Cache for Foundation Model provider
let foundationProviderCache: ReturnType<typeof createDatabricksProvider> | null = null;
let foundationProviderCacheTime = 0;
const PROVIDER_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for individual models
const foundationModelCache = new Map<
  string,
  { model: LanguageModelV2; timestamp: number }
>();
const MODEL_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get or create the Databricks Foundation Model provider
 */
async function getOrCreateFoundationProvider() {
  // Check if we have a cached provider that's still fresh
  if (
    foundationProviderCache &&
    Date.now() - foundationProviderCacheTime < PROVIDER_CACHE_DURATION
  ) {
    console.log('[Foundation] Using cached Foundation Model provider');
    return foundationProviderCache;
  }

  console.log('[Foundation] Creating new Foundation Model provider');

  // Get authentication token
  const token = await getDatabricksToken();
  const hostname = getHostUrl();

  // Create provider for Foundation Models
  const provider = createDatabricksProvider({
    baseURL: `${hostname}/serving-endpoints`,
    fetch: async (...[input, init]: Parameters<typeof fetch>) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);

      // Log the Foundation Model request
      const url = input.toString();
      if (init?.body) {
        try {
          const requestBody =
            typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
          console.log(
            '[Foundation] Request:',
            JSON.stringify({
              url,
              method: init.method || 'POST',
              model: requestBody.model,
              messageCount: requestBody.messages?.length,
            }),
          );
        } catch (_e) {
          console.log('[Foundation] Request (raw):', { url, method: init.method });
        }
      }

      const response = await fetch(input, {
        ...init,
        headers,
      });

      // Log response status
      console.log(`[Foundation] Response status: ${response.status}`);

      return response;
    },
  });

  foundationProviderCache = provider;
  foundationProviderCacheTime = Date.now();
  return provider;
}

/**
 * Get a Foundation Model language model instance
 */
export async function getFoundationModel(
  modelId: FoundationModelId,
): Promise<LanguageModelV2> {
  // Check cache first
  const cached = foundationModelCache.get(modelId);
  if (cached && Date.now() - cached.timestamp < MODEL_CACHE_DURATION) {
    console.log(`[Foundation] Using cached model for ${modelId}`);
    return cached.model;
  }

  console.log(`[Foundation] Creating fresh model for ${modelId}`);

  // Get the provider
  const provider = await getOrCreateFoundationProvider();

  // Create the model using the chatCompletions endpoint (llm/v1/chat)
  const model = provider.chatCompletions(modelId);

  // Wrap with middleware
  const wrappedModel = wrapLanguageModel({
    model,
    middleware: [extractReasoningMiddleware({ tagName: 'think' })],
  });

  // Cache the model
  foundationModelCache.set(modelId, {
    model: wrappedModel,
    timestamp: Date.now(),
  });

  return wrappedModel;
}

/**
 * Check if a model ID is a Foundation Model
 */
export function isFoundationModel(modelId: string): modelId is FoundationModelId {
  return FOUNDATION_MODELS.includes(modelId as FoundationModelId);
}

/**
 * Get the default Foundation Model
 */
export function getDefaultFoundationModel(): FoundationModelId {
  return process.env.DEFAULT_FOUNDATION_MODEL as FoundationModelId || 'databricks-meta-llama-3-3-70b-instruct';
}