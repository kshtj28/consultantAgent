/**
 * OpenRouter Provider Implementation
 */

import OpenAI from 'openai';
import { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './LLMProvider';
import { getProviderApiKey } from '../../config/env';

export class OpenRouterProvider implements LLMProvider {
    readonly name = 'openrouter';
    private client: OpenAI | null = null;
    private model: string;

    constructor(model: string = 'qwen/qwen-2.5-72b-instruct') {
        this.model = model;
    }

    private getClient(): OpenAI {
        if (!this.client) {
            const apiKey = getProviderApiKey('openrouter');
            if (!apiKey) {
                throw new Error('OpenRouter API key not configured');
            }
            this.client = new OpenAI({ 
                apiKey,
                baseURL: 'https://openrouter.ai/api/v1',
                defaultHeaders: {
                    'HTTP-Referer': 'https://github.com/kshtj28/consultantAgent',
                    'X-Title': 'Consultant Agent',
                }
            });
        }
        return this.client;
    }

    isAvailable(): boolean {
        return !!getProviderApiKey('openrouter');
    }

    async generate(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
        const client = this.getClient();
        const modelToUse = options.model || this.model;
        const startMs = Date.now();

        const completion = await client.chat.completions.create({
            model: modelToUse,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 2000,
        });

        const choice = completion.choices[0];
        return {
            content: choice.message.content || '',
            model: modelToUse,
            provider: this.name,
            usage: {
                promptTokens: completion.usage?.prompt_tokens,
                completionTokens: completion.usage?.completion_tokens,
                totalTokens: completion.usage?.total_tokens,
            },
            metadata: {
                providerName: this.name,
                modelUsed: modelToUse,
                latencyMs: Date.now() - startMs,
                finishReason: choice.finish_reason ?? undefined,
            },
        };
    }

    async embed(text: string): Promise<number[]> {
        throw new Error('OpenRouter embedding not supported. Use OpenAI or Ollama for embeddings.');
    }

    async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<{ content?: string; done?: boolean; error?: string }> {
        const client = this.getClient();

        try {
            const stream = await client.chat.completions.create({
                model: this.model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? 2000,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    yield { content };
                }
            }
            yield { done: true };
        } catch (error: any) {
            yield { error: error.message };
        }
    }
}
