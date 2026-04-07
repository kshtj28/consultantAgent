/**
 * LLM Service (Backward Compatibility Layer)
 * 
 * This file provides backward compatibility for code that imports from llmService.
 * The actual implementation is now in the llm/ module using the factory pattern.
 * 
 * For new code, prefer importing directly from './llm':
 * ```typescript
 * import { llmFactory, generateCompletion, LLMProvider } from './llm';
 * ```
 */

// Re-export everything from the new factory-based module
export {
    LLMMessage,
    LLMResponse,
    LLMOptions,
    LLMProvider,
    LLMProviderConfig,
    llmFactory,
    generateCompletion,
    streamCompletion,
    initializeLLMProviders,
    OpenAIProvider,
    AnthropicProvider,
    GoogleProvider,
    OllamaProvider,
    LLMWarmingUpError,
    LLMModelNotConfiguredError,
} from './llm';

// Re-export types for backward compatibility
export type { OllamaConfig } from './llm';
