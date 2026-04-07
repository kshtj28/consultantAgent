import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Provider API Keys (at least one required)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),

  // Provider Models (comma-separated)
  OPENAI_MODELS: z.string().optional(),
  ANTHROPIC_MODELS: z.string().optional(),
  GOOGLE_MODELS: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODELS: z.string().optional(),

  // Ollama (On-Prem LLM)
  OLLAMA_BASE_URL: z.string().optional().default('http://localhost:11434'),
  OLLAMA_MODELS: z.string().optional(),
  OLLAMA_EMBED_MODEL: z.string().optional(),

  // NginxOllama (Nginx-proxied On-Prem LLM with API Key Auth)
  NGINX_OLLAMA_BASE_URL: z.string().optional(),
  NGINX_OLLAMA_API_KEY: z.string().optional(),
  NGINX_OLLAMA_MODELS: z.string().optional(),
  NGINX_OLLAMA_EMBED_MODEL: z.string().optional(),
  NGINX_OLLAMA_AUTH_HEADER: z.string().optional().default('Authorization'),

  // Default model (format: provider:model)
  DEFAULT_MODEL: z.string().default('openai:gpt-4o'),

  // OpenSearch
  OPENSEARCH_NODE: z.string().default('http://localhost:9200'),
  OPENSEARCH_USERNAME: z.string().default('admin'),
  OPENSEARCH_PASSWORD: z.string().default('admin'),

  // Server
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // JWT
  JWT_SECRET: z.string().default('default-secret-change-in-production'),

  // File Upload
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760'),

  // Admin Login
  ADMIN_PASSWORD: z.string().default('admin'),

  // GPU Scaling (on-demand GPU instance management)
  GPU_SCALING_MODE: z.string().optional().default('off'),
  ENVIRONMENT: z.string().optional().default('staging'),
  AWS_REGION: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;

// Model configuration types
export interface ModelConfig {
  id: string;        // format: provider:model
  provider: string;
  model: string;
  displayName: string;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  models: string[];
}

// Parse models string to array
const parseModels = (modelsStr: string | undefined): string[] => {
  if (!modelsStr) return [];
  return modelsStr.split(',').map(m => m.trim()).filter(m => m.length > 0);
};

// Get all configured providers with their API keys and models
export const getProviders = (): ProviderConfig[] => {
  const providers: ProviderConfig[] = [];

  if (env.OPENAI_API_KEY && env.OPENAI_MODELS) {
    providers.push({
      name: 'openai',
      apiKey: env.OPENAI_API_KEY,
      models: parseModels(env.OPENAI_MODELS),
    });
  }

  if (env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODELS) {
    providers.push({
      name: 'anthropic',
      apiKey: env.ANTHROPIC_API_KEY,
      models: parseModels(env.ANTHROPIC_MODELS),
    });
  }

  if (env.GOOGLE_API_KEY && env.GOOGLE_MODELS) {
    providers.push({
      name: 'google',
      apiKey: env.GOOGLE_API_KEY,
      models: parseModels(env.GOOGLE_MODELS),
    });
  }

  if (env.GROQ_API_KEY && env.GROQ_MODELS) {
    providers.push({
      name: 'groq',
      apiKey: env.GROQ_API_KEY,
      models: parseModels(env.GROQ_MODELS),
    });
  }

  // Ollama doesn't require API key, just base URL
  if (env.OLLAMA_MODELS) {
    providers.push({
      name: 'ollama',
      apiKey: env.OLLAMA_BASE_URL || 'http://localhost:11434', // Store base URL in apiKey field
      models: parseModels(env.OLLAMA_MODELS),
    });
  }

  // NginxOllama requires both API key and models to be configured
  if (env.NGINX_OLLAMA_API_KEY && env.NGINX_OLLAMA_MODELS) {
    providers.push({
      name: 'nginx-ollama',
      apiKey: env.NGINX_OLLAMA_API_KEY,
      models: parseModels(env.NGINX_OLLAMA_MODELS),
    });
  }

  return providers;
};

// Get all available models across all providers
export const getAvailableModels = (): ModelConfig[] => {
  const providers = getProviders();
  const models: ModelConfig[] = [];

  for (const provider of providers) {
    for (const model of provider.models) {
      models.push({
        id: `${provider.name}:${model}`,
        provider: provider.name,
        model: model,
        displayName: `${model} (${provider.name})`,
      });
    }
  }

  return models;
};

// Get the default model configuration
export const getDefaultModel = (): ModelConfig | null => {
  const allModels = getAvailableModels();
  const defaultId = env.DEFAULT_MODEL;

  const found = allModels.find(m => m.id === defaultId);
  if (found) return found;

  // Fallback preference: try to find a "safe" baseline model first
  const safeFallbacks = ['groq:llama-3.1-8b-instant', 'groq:llama-3-8b-8192', 'openai:gpt-4o-mini'];
  for (const id of safeFallbacks) {
    const safeMatch = allModels.find(m => m.id === id);
    if (safeMatch) {
      console.warn(`[CONFIG] Default model "${defaultId}" not found. Falling back to safe baseline: ${id}`);
      return safeMatch;
    }
  }

  // Last resort: first available, but log it
  if (allModels.length > 0) {
    console.warn(`[CONFIG] No suitable default or safe fallback found. Using first available: ${allModels[0].id}`);
    return allModels[0];
  }

  return null;
};

// Validate if a model ID is valid and return its config
export const getModelConfig = (modelId: string): ModelConfig | null => {
  const allModels = getAvailableModels();
  return allModels.find(m => m.id === modelId) || null;
};

// Get API key for a provider
export const getProviderApiKey = (providerName: string): string | null => {
  const providers = getProviders();
  const provider = providers.find(p => p.name === providerName);
  return provider?.apiKey || null;
};

// Check if at least one provider is configured
export const hasConfiguredProviders = (): boolean => {
  return getProviders().length > 0;
};
