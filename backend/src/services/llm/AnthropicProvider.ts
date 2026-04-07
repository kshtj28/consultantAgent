/**
 * Anthropic Provider Implementation
 */

import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './LLMProvider';
import { getProviderApiKey } from '../../config/env';

export class AnthropicProvider implements LLMProvider {
    readonly name = 'anthropic';
    private client: Anthropic | null = null;
    private model: string;

    constructor(model: string = 'claude-3-sonnet-20240229') {
        this.model = model;
    }

    private getClient(): Anthropic {
        if (!this.client) {
            const apiKey = getProviderApiKey('anthropic');
            if (!apiKey) {
                throw new Error('Anthropic API key not configured');
            }
            this.client = new Anthropic({ apiKey });
        }
        return this.client;
    }

    isAvailable(): boolean {
        return !!getProviderApiKey('anthropic');
    }

    async generate(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
        const client = this.getClient();
        const modelToUse = options.model || this.model;
        const startMs = Date.now();

        // Separate system message from other messages
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const chatMessages = messages.filter(m => m.role !== 'system');

        const completion = await client.messages.create({
            model: modelToUse,
            max_tokens: options.maxTokens ?? 2000,
            system: systemMessage || undefined,
            messages: chatMessages.map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
        });

        const textBlock = completion.content.find(block => block.type === 'text');
        const content = textBlock && 'text' in textBlock ? textBlock.text : '';

        // Extract thinking/reasoning block if present and requested
        let reasoning: string | undefined;
        if (options.includeReasoning) {
            const thinkingBlock = completion.content.find(block => block.type === 'thinking');
            if (thinkingBlock && 'thinking' in thinkingBlock) {
                reasoning = (thinkingBlock as any).thinking as string;
            }
        }

        return {
            content,
            model: modelToUse,
            provider: this.name,
            reasoning,
            usage: {
                promptTokens: completion.usage?.input_tokens,
                completionTokens: completion.usage?.output_tokens,
                totalTokens: (completion.usage?.input_tokens ?? 0) + (completion.usage?.output_tokens ?? 0),
            },
            metadata: {
                providerName: this.name,
                modelUsed: modelToUse,
                latencyMs: Date.now() - startMs,
                finishReason: completion.stop_reason ?? undefined,
            },
        };
    }

    async *stream(messages: LLMMessage[], options: LLMOptions = {}): AsyncGenerator<{ content?: string; done?: boolean; error?: string }> {
        const client = this.getClient();

        try {
            const systemMessage = messages.find(m => m.role === 'system')?.content || '';
            const chatMessages = messages.filter(m => m.role !== 'system');

            const stream = await client.messages.stream({
                model: this.model,
                max_tokens: options.maxTokens ?? 2000,
                system: systemMessage,
                messages: chatMessages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            });

            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    yield { content: event.delta.text };
                }
            }
            yield { done: true };
        } catch (error: any) {
            yield { error: error.message };
        }
    }
}
