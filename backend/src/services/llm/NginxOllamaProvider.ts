/**
 * NginxOllamaProvider — Ollama accessed through an nginx reverse proxy with API key authentication.
 *
 * Env vars:
 *   NGINX_OLLAMA_BASE_URL     Base URL of the nginx proxy (e.g. https://llm.internal.corp)
 *   NGINX_OLLAMA_API_KEY      API key / bearer token to pass in the auth header
 *   NGINX_OLLAMA_MODELS       Comma-separated list of available model names
 *   NGINX_OLLAMA_EMBED_MODEL  Model name used for embeddings (default: nomic-embed-text)
 *   NGINX_OLLAMA_AUTH_HEADER  Header name to use (default: Authorization → "Bearer <key>")
 *                             Set to "x-api-key" or any custom header for raw key passthrough
 */

import { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './LLMProvider';
import { env } from '../../config/env';

export class NginxOllamaProvider implements LLMProvider {
    readonly name = 'nginx-ollama';

    private baseUrl: string;
    private apiKey: string;
    private authHeader: string;
    private model: string;
    private embedModel: string;

    constructor() {
        this.baseUrl = (env.NGINX_OLLAMA_BASE_URL || '').replace(/\/$/, '');
        this.apiKey = env.NGINX_OLLAMA_API_KEY || '';
        this.authHeader = env.NGINX_OLLAMA_AUTH_HEADER || 'Authorization';

        let defaultModel = 'llama2';
        if (env.NGINX_OLLAMA_MODELS) {
            const models = env.NGINX_OLLAMA_MODELS.split(',');
            if (models.length > 0 && models[0].trim()) {
                defaultModel = models[0].trim();
            }
        }
        this.model = defaultModel;
        this.embedModel = env.NGINX_OLLAMA_EMBED_MODEL || 'nomic-embed-text';
    }

    isAvailable(): boolean {
        return !!(env.NGINX_OLLAMA_MODELS && env.NGINX_OLLAMA_API_KEY && env.NGINX_OLLAMA_BASE_URL);
    }

    private getAuthHeaders(): Record<string, string> {
        const headerName = this.authHeader;
        // For x-api-key style headers, pass the key directly; otherwise use Bearer scheme
        const isRawKeyHeader = headerName.toLowerCase() === 'x-api-key';
        const headerValue = isRawKeyHeader ? this.apiKey : `Bearer ${this.apiKey}`;
        return { [headerName]: headerValue };
    }

    async generate(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
        const startMs = Date.now();
        const endpoint = `${this.baseUrl}/api/chat`;
        const modelToUse = options.model || this.model;

        const ollamaMessages = messages.map(m => ({ role: m.role, content: m.content }));

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders(),
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
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`NginxOllama API error (${response.status}): ${errorText}`);
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
                metadata: {
                    providerName: this.name,
                    modelUsed: modelToUse,
                    latencyMs: Date.now() - startMs,
                    finishReason: data.done_reason,
                },
                usage: {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count,
                    totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
                },
            };
        } catch (error: any) {
            console.error('NginxOllama request failed:', error.message);
            throw new Error(`NginxOllama request failed: ${error.message}`);
        }
    }

    async *stream(
        messages: LLMMessage[],
        options: LLMOptions = {}
    ): AsyncGenerator<{ content?: string; done?: boolean; error?: string }> {
        const endpoint = `${this.baseUrl}/api/chat`;
        const modelToUse = options.model || this.model;
        const ollamaMessages = messages.map(m => ({ role: m.role, content: m.content }));

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders(),
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: ollamaMessages,
                    stream: true,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 2000,
                    },
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                yield { error: `NginxOllama API error (${response.status}): ${errorText}` };
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
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders(),
                },
                body: JSON.stringify({
                    model: this.embedModel,
                    prompt: text,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`NginxOllama embedding error (${response.status}): ${errorText}`);
            }

            const data = await response.json() as { embedding: number[] };
            return data.embedding;
        } catch (error: any) {
            console.error('NginxOllama embedding request failed:', error.message);
            throw new Error(`NginxOllama embedding request failed: ${error.message}`);
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                headers: this.getAuthHeaders(),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async listModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                headers: this.getAuthHeaders(),
            });
            if (!response.ok) return [];
            const data = await response.json() as { models?: { name: string }[] };
            return data.models?.map(m => m.name) || [];
        } catch {
            return [];
        }
    }
}
