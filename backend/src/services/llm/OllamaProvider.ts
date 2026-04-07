/**
 * Ollama Provider Implementation (On-Prem LLM)
 */

import { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './LLMProvider';
import { env } from '../../config/env';

export interface OllamaConfig {
    baseUrl?: string;
    model?: string;
}

export class OllamaProvider implements LLMProvider {
    readonly name = 'ollama';
    private baseUrl: string;
    private model: string;
    private embedModel: string;

    constructor(config: OllamaConfig = {}) {
        this.baseUrl = config.baseUrl || env.OLLAMA_BASE_URL || 'http://localhost:11434';

        // Determine default model
        let defaultModel = 'llama2';
        if (env.OLLAMA_MODELS) {
            const models = env.OLLAMA_MODELS.split(',');
            if (models.length > 0 && models[0].trim()) {
                defaultModel = models[0].trim();
            }
        }



        this.model = config.model || defaultModel;
        this.embedModel = env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    }

    isAvailable(): boolean {
        // Ollama is available if OLLAMA_MODELS is configured
        return !!env.OLLAMA_MODELS;
    }

    async generate(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
        const endpoint = `${this.baseUrl}/api/chat`;
        const modelToUse = options.model || this.model;
        const startMs = Date.now();

        const ollamaMessages = messages.map(m => ({
            role: m.role,
            content: m.content,
        }));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120_000);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: ollamaMessages,
                    stream: false,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 2000,
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            const data = await response.json() as {
                message?: { content: string };
                done_reason?: string;
                prompt_eval_count?: number;
                eval_count?: number;
            };

            return {
                content: data.message?.content || '',
                model: modelToUse,
                provider: this.name,
                usage: {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count,
                    totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
                },
                metadata: {
                    providerName: this.name,
                    modelUsed: modelToUse,
                    latencyMs: Date.now() - startMs,
                    finishReason: data.done_reason,
                },
            };
        } catch (error: any) {
            console.error('Ollama request failed:', error.message);
            throw new Error(`Ollama request failed: ${error.message}`);
        }
    }

    async * stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<{ content?: string; done?: boolean; error?: string }> {
        const endpoint = `${this.baseUrl}/api/chat`;

        const ollamaMessages = messages.map(m => ({
            role: m.role,
            content: m.content,
        }));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120_000);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: options.model || this.model,
                    messages: ollamaMessages,
                    stream: true,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 2000,
                    },
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                yield { error: `Ollama API error (${response.status}): ${errorText}` };
                return;
            }

            const reader = response.body?.getReader();
            if (!reader) {
                yield { error: 'No response body' };
                return;
            }

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line) as { message?: { content: string }; done?: boolean };
                        if (data.message?.content) {
                            yield { content: data.message.content };
                        }
                        if (data.done) {
                            yield { done: true };
                        }
                    } catch {
                        // Skip malformed JSON lines
                    }
                }
            }
        } catch (error: any) {
            yield { error: error.message };
        }
    }

    async embed(text: string): Promise<number[]> {
        const endpoint = `${this.baseUrl}/api/embeddings`;

        try {
            console.log('Ollama embedding model:', this.embedModel);
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.embedModel,
                    prompt: text,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama embedding error (${response.status}): ${errorText}`);
            }

            const data = await response.json() as { embedding: number[] };
            return data.embedding;
        } catch (error: any) {
            console.error('Ollama embedding request failed:', error.message);
            throw new Error(`Ollama embedding request failed: ${error.message} ${error.stack}`);
        }
    }

    /**
     * Check if Ollama server is running
     */
    async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * List available models on the Ollama server
     */
    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];

            const data = await response.json() as { models?: { name: string }[] };
            return data.models?.map(m => m.name) || [];
        } catch {
            return [];
        }
    }
}
