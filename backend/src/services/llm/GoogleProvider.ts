/**
 * Google/Gemini Provider Implementation
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './LLMProvider';
import { getProviderApiKey } from '../../config/env';

export class GoogleProvider implements LLMProvider {
    readonly name = 'google';
    private client: GoogleGenerativeAI | null = null;
    private model: string;

    constructor(model: string = 'gemini-pro') {
        this.model = model;
    }

    private getClient(): GoogleGenerativeAI {
        if (!this.client) {
            const apiKey = getProviderApiKey('google');
            if (!apiKey) {
                throw new Error('Google API key not configured');
            }
            this.client = new GoogleGenerativeAI(apiKey);
        }
        return this.client;
    }

    isAvailable(): boolean {
        return !!getProviderApiKey('google');
    }

    async generate(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResponse> {
        const client = this.getClient();
        const modelToUse = options.model || this.model;
        const startMs = Date.now();
        const genModel = client.getGenerativeModel({ 
            model: modelToUse,
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
        });

        // Extract system instruction and build history
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        const chatMessages = messages.filter(m => m.role !== 'system');

        // Build chat history (all but last message)
        const history = chatMessages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user' as 'model' | 'user',
            parts: [{ text: m.content }],
        }));

        const lastMessage = chatMessages[chatMessages.length - 1];

        const chat = genModel.startChat({
            history,
            systemInstruction: systemMessage ? { role: 'system', parts: [{ text: systemMessage }] } : undefined,
            generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens: options.maxTokens ?? 2000,
            },
        });

        const result = await chat.sendMessage(lastMessage.content);
        const response = await result.response;
        const usageMeta = (response as any).usageMetadata;

        return {
            content: response.text(),
            model: modelToUse,
            provider: this.name,
            usage: {
                promptTokens: usageMeta?.promptTokenCount,
                completionTokens: usageMeta?.candidatesTokenCount,
                totalTokens: usageMeta?.totalTokenCount,
            },
            metadata: {
                providerName: this.name,
                modelUsed: modelToUse,
                latencyMs: Date.now() - startMs,
                finishReason: (response as any).candidates?.[0]?.finishReason,
            },
        };
    }
}
