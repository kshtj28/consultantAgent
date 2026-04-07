/**
 * LLM Provider Interface and Factory
 * Provides a pluggable architecture for any LLM provider (cloud or on-prem)
 */

// Message format for all providers
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// Response format from all providers
export interface LLMResponse {
    content: string;
    model: string;
    provider: string;
    /** Chain-of-thought or extended thinking text (models that expose it) */
    reasoning?: string;
    /** Error message if generation partially failed or had a recoverable issue */
    error?: string;
    /** Token usage reported by the provider */
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    /** Provider-level metadata for debugging and observability */
    metadata?: {
        providerName: string;
        modelUsed: string;
        latencyMs?: number;
        /** stop | length | content_filter | tool_calls | end_turn etc. */
        finishReason?: string;
    };
}

// Options for generation
export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    model?: string;  // override the provider's default model
    /** Request reasoning/thinking tokens if the provider supports them */
    includeReasoning?: boolean;
}

// Provider configuration
export interface LLMProviderConfig {
    name: string;
    baseUrl?: string;
    apiKey?: string;
    model: string;
    [key: string]: any; // Allow additional provider-specific config
}

/**
 * Base interface for all LLM providers
 * Implement this interface to add a new provider
 */
export interface LLMProvider {
    readonly name: string;

    /**
     * Generate a completion from the provider
     */
    generate(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;

    /**
     * Optional: Stream a completion (not all providers support this)
     */
    stream?(messages: LLMMessage[], options?: LLMOptions): AsyncGenerator<{ content?: string; done?: boolean; error?: string }>;

    /**
     * Optional: Generate embeddings (not all providers support this)
     */
    embed?(text: string): Promise<number[]>;

    /**
     * Check if the provider is available/configured
     */
    isAvailable(): boolean;
}

/**
 * LLM Provider Factory
 * Manages registration and creation of LLM providers
 */
class LLMProviderFactory {
    private providers: Map<string, () => LLMProvider> = new Map();
    private instances: Map<string, LLMProvider> = new Map();
    private defaultProviderName: string | null = null;

    /**
     * Register a provider factory function
     */
    register(name: string, factory: () => LLMProvider): void {
        this.providers.set(name.toLowerCase(), factory);
        console.log(`📦 Registered LLM provider: ${name}`);
    }

    /**
     * Get or create a provider instance
     */
    getProvider(name: string): LLMProvider {
        const normalizedName = name.toLowerCase();

        // Return cached instance if available
        if (this.instances.has(normalizedName)) {
            return this.instances.get(normalizedName)!;
        }

        // Create new instance from factory
        const factory = this.providers.get(normalizedName);
        if (!factory) {
            throw new Error(`LLM provider "${name}" not registered. Available providers: ${this.listProviders().join(', ')}`);
        }

        const instance = factory();
        this.instances.set(normalizedName, instance);
        return instance;
    }

    /**
     * Set the default provider
     */
    setDefault(name: string): void {
        const normalizedName = name.toLowerCase();
        if (!this.providers.has(normalizedName)) {
            throw new Error(`Cannot set default: provider "${name}" not registered`);
        }
        this.defaultProviderName = normalizedName;
        console.log(`🔧 Default LLM provider set to: ${name}`);
    }

    /**
     * Get the default provider
     */
    getDefault(): LLMProvider {
        if (!this.defaultProviderName) {
            // Try to get first available provider
            for (const [name, factory] of this.providers) {
                const instance = factory();
                if (instance.isAvailable()) {
                    this.instances.set(name, instance);
                    this.defaultProviderName = name;
                    return instance;
                }
            }
            throw new Error('No LLM providers available');
        }
        return this.getProvider(this.defaultProviderName);
    }

    /**
     * List all registered providers
     */
    listProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * List available (configured) providers
     */
    listAvailableProviders(): string[] {
        const available: string[] = [];
        for (const [name] of this.providers) {
            try {
                const provider = this.getProvider(name);
                if (provider.isAvailable()) {
                    available.push(name);
                }
            } catch {
                // Skip unavailable providers
            }
        }
        return available;
    }

    /**
     * Clear cached instances (useful for testing)
     */
    clearInstances(): void {
        this.instances.clear();
    }
}

// Export singleton factory instance
export const llmFactory = new LLMProviderFactory();
