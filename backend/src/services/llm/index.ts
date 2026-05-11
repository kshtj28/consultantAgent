/**
 * LLM Module Index
 * 
 * This module provides a pluggable LLM provider architecture.
 * 
 * Usage:
 * ```typescript
 * import { llmFactory, generateCompletion } from './services/llm';
 * 
 * // Use default provider
 * const response = await generateCompletion([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * 
 * // Use specific provider
 * const provider = llmFactory.getProvider('ollama');
 * const response = await provider.generate([...]);
 * 
 * // Register custom provider
 * llmFactory.register('custom', () => new MyCustomProvider());
 * ```
 */

export {
    LLMProvider,
    LLMMessage,
    LLMResponse,
    LLMOptions,
    LLMProviderConfig,
    llmFactory,
} from './LLMProvider';

export { OpenAIProvider } from './OpenAIProvider';
export { AnthropicProvider } from './AnthropicProvider';
export { GoogleProvider } from './GoogleProvider';
export { OllamaProvider, OllamaConfig } from './OllamaProvider';
export { NginxOllamaProvider } from './NginxOllamaProvider';
export { OpenRouterProvider } from './OpenRouterProvider';
export { GroqProvider } from './GroqProvider';

// Import providers for registration
import { llmFactory } from './LLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { GoogleProvider } from './GoogleProvider';
import { OllamaProvider } from './OllamaProvider';
import { NginxOllamaProvider } from './NginxOllamaProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { GroqProvider } from './GroqProvider';
import { env, getDefaultModel } from '../../config/env';

/**
 * Custom error thrown when LLM providers are unavailable due to
 * connection issues (e.g. Ollama/GPU instance still warming up).
 */
export class LLMWarmingUpError extends Error {
    public readonly code = 'LLM_WARMING_UP';

    constructor(message: string) {
        super(message);
        this.name = 'LLMWarmingUpError';
    }
}

import { getEffectiveModel } from '../settingsService';

export class LLMModelNotConfiguredError extends Error {
    public readonly code = 'LLM_MODEL_NOT_CONFIGURED';

    constructor(message: string = 'No default model configured. Set DEFAULT_MODEL in environment.') {
        super(message);
        this.name = 'LLMModelNotConfiguredError';
    }
}

const CONNECTION_ERROR_PATTERN =
    /fetch failed|econnrefused|enotfound|econnreset|etimedout|socket hang up|network|connect/i;

function isConnectionError(message: string): boolean {
    return CONNECTION_ERROR_PATTERN.test(message);
}

function isOllamaProvider(name: string): boolean {
    return name.toLowerCase().includes('ollama');
}

/**
 * Initialize and register all built-in providers
 */
export function initializeLLMProviders(): void {
    // Register OpenAI provider
    llmFactory.register('openai', () => new OpenAIProvider());

    // Register Anthropic provider
    llmFactory.register('anthropic', () => new AnthropicProvider());

    // Register Google provider
    llmFactory.register('google', () => new GoogleProvider());

    // Register Ollama provider
    llmFactory.register('ollama', () => new OllamaProvider());

    // Register OpenRouter provider
    llmFactory.register('openrouter', () => new OpenRouterProvider());

    // Register Groq provider
    llmFactory.register('groq', () => new GroqProvider());

    // Register NginxOllama provider (only active when NGINX_OLLAMA_API_KEY + NGINX_OLLAMA_MODELS are set)
    llmFactory.register('nginx-ollama', () => new NginxOllamaProvider());

    // Set default provider based on environment config
    const defaultModel = getDefaultModel();
    if (defaultModel) {
        try {
            llmFactory.setDefault(defaultModel.provider);
        } catch {
            console.warn(`Could not set default provider: ${defaultModel.provider}`);
        }
    }

    console.log(`📦 LLM providers initialized. Available: ${llmFactory.listAvailableProviders().join(', ')}`);
}

/**
 * Convenience function to generate completion using the factory
 * 
 * Supports two signatures for backward compatibility:
 * - New: generateCompletion(messages, options?, providerName?)
 * - Legacy: generateCompletion(modelId, messages, options?)
 */
export async function generateCompletion(
    messagesOrModelId: import('./LLMProvider').LLMMessage[] | string | null,
    optionsOrMessages?: import('./LLMProvider').LLMOptions | import('./LLMProvider').LLMMessage[],
    providerNameOrOptions?: string | import('./LLMProvider').LLMOptions
): Promise<import('./LLMProvider').LLMResponse> {
    let messages: import('./LLMProvider').LLMMessage[];
    let options: import('./LLMProvider').LLMOptions | undefined;
    let providerName: string | undefined;

    // Detect which signature is being used
    if (Array.isArray(messagesOrModelId)) {
        // New signature: generateCompletion(messages, options?, providerName?)
        messages = messagesOrModelId;
        options = optionsOrMessages as import('./LLMProvider').LLMOptions | undefined;
        providerName = providerNameOrOptions as string | undefined;
    } else {
        // Legacy signature: generateCompletion(modelId, messages, options?)
        messages = optionsOrMessages as import('./LLMProvider').LLMMessage[];
        options = providerNameOrOptions as import('./LLMProvider').LLMOptions | undefined;

        // If modelId contains provider prefix (e.g., "ollama:gemma3:4b"), extract both provider and model
        if (messagesOrModelId && typeof messagesOrModelId === 'string' && messagesOrModelId.includes(':')) {
            const firstColonIndex = messagesOrModelId.indexOf(':');
            const provider = messagesOrModelId.substring(0, firstColonIndex);
            const model = messagesOrModelId.substring(firstColonIndex + 1);
            providerName = provider;
            options = { ...options, model };
        } else if (messagesOrModelId && typeof messagesOrModelId === 'string') {
            options = { ...options, model: messagesOrModelId };
        }
    }

    // Dynamic resolution if no specific provider/model was requested via legacy id
    if (!providerName) {
        // Safe check for model string
        const modelStr = options?.model;

        // If we only have a model name with a slash like "groq/compound-mini", we can infer the provider
        if (modelStr && typeof modelStr === 'string' && modelStr.includes('/')) {
            const [p] = modelStr.split('/');
             if (['openai', 'anthropic', 'google', 'groq', 'ollama', 'openrouter'].includes(p)) {
                  providerName = p;
                  // Don't change options.model here, keep it as "groq/compound-mini"
             }
        }
    }

    // Always check effective model (from settings) unless a specific provider was already pinned
    if (!providerName) {
        const effectiveModel = await getEffectiveModel(options?.model);
        if (effectiveModel) {
            providerName = effectiveModel.provider;
            options = { ...options, model: effectiveModel.model };
        }
    }

    let provider;
    try {
        provider = providerName
            ? llmFactory.getProvider(providerName)
            : llmFactory.getDefault();
    } catch (err) {
        throw new LLMModelNotConfiguredError();
    }

    const finalModel = options?.model || (provider as any).model || 'default';
    console.log(`[LLM] Resolved Request: Provider=${provider.name} Model=${finalModel}`);

    try {
        return await provider.generate(messages, options);
    } catch (err) {
        // If a specific provider was requested, don't fallback — but still detect warming up
        if (providerName) {
            const msg = (err as Error).message || '';
            if (isOllamaProvider(providerName) && isConnectionError(msg)) {
                throw new LLMWarmingUpError(
                    `AI engine is not ready yet. The GPU/Ollama instance may still be warming up. (${msg})`
                );
            }
            throw err;
        }

        console.warn(`Default provider "${provider.name}" failed, trying fallback providers…`, (err as Error).message);

        // Try other available providers
        const available = llmFactory.listAvailableProviders().filter(p => p !== provider.name);
        for (const fallbackName of available) {
            try {
                const fallback = llmFactory.getProvider(fallbackName);
                console.log(`Falling back to provider: ${fallbackName}`);
                return await fallback.generate(messages, options);
            } catch (fallbackErr) {
                console.warn(`Fallback provider "${fallbackName}" also failed:`);// , (fallbackErr as Error).message);
            }
        }

        // All providers failed — signal warm-up only if the default provider is Ollama and it's a connection error
        const rootMsg = (err as Error).message || '';
        if (isOllamaProvider(provider.name) && isConnectionError(rootMsg)) {
            throw new LLMWarmingUpError(
                `AI engine is not ready yet. The GPU/Ollama instance may still be warming up. (${rootMsg})`
            );
        }
        throw new Error(`All LLM providers failed. Default (${provider.name}): ${rootMsg}`);
    }
}

/**
 * Convenience function to stream completion using the factory
 * 
 * Supports two signatures for backward compatibility:
 * - New: streamCompletion(messages, options?, providerName?)
 * - Legacy: streamCompletion(modelId, messages, options?)
 */
export async function* streamCompletion(
    messagesOrModelId: import('./LLMProvider').LLMMessage[] | string | null,
    optionsOrMessages?: import('./LLMProvider').LLMOptions | import('./LLMProvider').LLMMessage[],
    providerNameOrOptions?: string | import('./LLMProvider').LLMOptions
): AsyncGenerator<{ content?: string; done?: boolean; error?: string }> {
    let messages: import('./LLMProvider').LLMMessage[];
    let options: import('./LLMProvider').LLMOptions | undefined;
    let providerName: string | undefined;

    // Detect which signature is being used
    if (Array.isArray(messagesOrModelId)) {
        // New signature: streamCompletion(messages, options?, providerName?)
        messages = messagesOrModelId;
        options = optionsOrMessages as import('./LLMProvider').LLMOptions | undefined;
        providerName = providerNameOrOptions as string | undefined;
    } else {
        // Legacy signature: streamCompletion(modelId, messages, options?)
        messages = optionsOrMessages as import('./LLMProvider').LLMMessage[];
        options = providerNameOrOptions as import('./LLMProvider').LLMOptions | undefined;

        // If modelId contains provider prefix (e.g., "ollama:gemma3:4b"), extract both provider and model
        if (messagesOrModelId && typeof messagesOrModelId === 'string' && messagesOrModelId.includes(':')) {
            const firstColonIndex = messagesOrModelId.indexOf(':');
            const provider = messagesOrModelId.substring(0, firstColonIndex);
            const model = messagesOrModelId.substring(firstColonIndex + 1);
            providerName = provider;
            options = { ...options, model };
        } else if (messagesOrModelId && typeof messagesOrModelId === 'string') {
            options = { ...options, model: messagesOrModelId };
        }
    }

    // Dynamic resolution if no specific provider/model was requested via legacy id
    if (!providerName) {
        const modelStr = options?.model;
        // If we only have a model name with a slash like "groq/compound-mini", we can infer the provider
        if (modelStr && typeof modelStr === 'string' && modelStr.includes('/')) {
            const [p] = modelStr.split('/');
            if (['openai', 'anthropic', 'google', 'groq', 'ollama'].includes(p)) {
                 providerName = p;
            }
        }
    }

    if (!providerName) {
        const effectiveModel = await getEffectiveModel(options?.model);
        if (effectiveModel) {
            providerName = effectiveModel.provider;
            options = { ...options, model: effectiveModel.model };
        }
    }

    let provider;
    try {
        provider = providerName
            ? llmFactory.getProvider(providerName)
            : llmFactory.getDefault();
    } catch (err) {
        throw new LLMModelNotConfiguredError();
    }

    const finalModel = options?.model || (provider as any).model || 'default';
    console.log(`[LLM-Stream] Resolved Request: Provider=${provider.name} Model=${finalModel}`);

    try {
        if (provider.stream) {
            yield* provider.stream(messages, options);
        } else {
            const response = await provider.generate(messages, options);
            yield { content: response.content };
            yield { done: true };
        }
    } catch (err) {
        if (providerName) {
            const msg = (err as Error).message || '';
            if (isOllamaProvider(providerName) && isConnectionError(msg)) {
                throw new LLMWarmingUpError(
                    `AI engine is not ready yet. The GPU/Ollama instance may still be warming up. (${msg})`
                );
            }
            throw err;
        }

        console.warn(`Default provider "${provider.name}" failed for streaming, trying fallback…`, (err as Error).message);

        const available = llmFactory.listAvailableProviders().filter(p => p !== provider.name);
        for (const fallbackName of available) {
            try {
                const fallback = llmFactory.getProvider(fallbackName);
                console.log(`Falling back to provider: ${fallbackName}`);
                if (fallback.stream) {
                    yield* fallback.stream(messages, options);
                } else {
                    const response = await fallback.generate(messages, options);
                    yield { content: response.content };
                    yield { done: true };
                }
                return;
            } catch (fallbackErr) {
                console.warn(`Fallback provider "${fallbackName}" also failed:`); //, (fallbackErr as Error).message);
            }
        }

        const rootMsg = (err as Error).message || '';
        if (isOllamaProvider(provider.name) && isConnectionError(rootMsg)) {
            throw new LLMWarmingUpError(
                `AI engine is not ready yet. The GPU/Ollama instance may still be warming up. (${rootMsg})`
            );
        }
        throw err;
    }
}

// Auto-initialize on import
initializeLLMProviders();
