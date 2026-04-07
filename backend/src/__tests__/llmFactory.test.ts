import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for Ollama
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock the env module
vi.mock('../../config/env', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        getProviderApiKey: vi.fn().mockReturnValue('test-api-key'),
        getDefaultModel: vi.fn().mockReturnValue({
            id: 'openai:gpt-4',
            provider: 'openai',
            model: 'gpt-4',
            displayName: 'GPT-4',
        }),
        env: {
            OLLAMA_BASE_URL: 'http://localhost:11434',
            OLLAMA_MODELS: 'llama2',
        },
    };
});

// Mock OpenAI
vi.mock('openai', () => ({
    default: vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'OpenAI response' } }],
                }),
            },
        },
    })),
}));

// Mock Anthropic
vi.mock('@anthropic-ai/sdk', () => ({
    default: vi.fn().mockImplementation(() => ({
        messages: {
            create: vi.fn().mockResolvedValue({
                content: [{ type: 'text', text: 'Anthropic response' }],
            }),
        },
    })),
}));

// Mock Google
vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi.fn().mockReturnValue({
            startChat: vi.fn().mockReturnValue({
                sendMessage: vi.fn().mockResolvedValue({
                    response: {
                        text: () => 'Google response',
                    },
                }),
            }),
        }),
    })),
}));

import { llmFactory, LLMMessage, generateCompletion, OpenAIProvider, OllamaProvider } from '../services/llm';

describe('LLM Factory', () => {
    const mockMessages: LLMMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        llmFactory.clearInstances();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('llmFactory', () => {
        it('should list registered providers', () => {
            const providers = llmFactory.listProviders();
            expect(providers).toContain('openai');
            expect(providers).toContain('anthropic');
            expect(providers).toContain('google');
            expect(providers).toContain('ollama');
        });

        it('should get a registered provider', () => {
            const provider = llmFactory.getProvider('openai');
            expect(provider).toBeDefined();
            expect(provider.name).toBe('openai');
        });

        it('should throw error for unregistered provider', () => {
            expect(() => llmFactory.getProvider('nonexistent')).toThrow('not registered');
        });

        it('should cache provider instances', () => {
            const provider1 = llmFactory.getProvider('openai');
            const provider2 = llmFactory.getProvider('openai');
            expect(provider1).toBe(provider2);
        });
    });

    describe('OpenAIProvider', () => {
        it('should have correct name', () => {
            const provider = new OpenAIProvider();
            expect(provider.name).toBe('openai');
        });

        it.skip('should generate completion', async () => {
            const provider = llmFactory.getProvider('openai');
            const response = await provider.generate(mockMessages);
            expect(response.provider).toBe('openai');
            expect(response.content).toBe('OpenAI response');
        });
    });

    describe('OllamaProvider', () => {
        it('should have correct name', () => {
            const provider = new OllamaProvider();
            expect(provider.name).toBe('ollama');
        });

        it('should generate completion', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    message: { content: 'Ollama response' },
                }),
            });

            const provider = new OllamaProvider({ baseUrl: 'http://localhost:11434', model: 'llama2' });
            const response = await provider.generate(mockMessages);

            expect(response.provider).toBe('ollama');
            expect(response.content).toBe('Ollama response');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:11434/api/chat',
                expect.objectContaining({
                    method: 'POST',
                })
            );
        });

        it('should throw error on API failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Server error',
            });

            const provider = new OllamaProvider();
            await expect(provider.generate(mockMessages)).rejects.toThrow('Ollama API error');
        });
    });

    describe('generateCompletion (backward compatibility)', () => {
        beforeEach(() => {
            // Register a mock provider that doesn't need real API keys
            const mockProvider = {
                name: 'openai',
                isAvailable: () => true,
                generate: vi.fn().mockResolvedValue({
                    content: 'Mock response',
                    model: 'gpt-4',
                    provider: 'openai',
                }),
            };
            llmFactory.register('openai', () => mockProvider as any);
            llmFactory.setDefault('openai');
        });

        it('should work with new signature (messages array first)', async () => {
            const response = await generateCompletion(mockMessages);
            expect(response).toBeDefined();
            expect(response.content).toBe('Mock response');
        });

        it('should work with legacy signature (modelId first)', async () => {
            const response = await generateCompletion('openai:gpt-4', mockMessages);
            expect(response).toBeDefined();
            expect(response.content).toBe('Mock response');
        });

        it('should extract provider from modelId', async () => {
            const response = await generateCompletion('openai:gpt-4o', mockMessages);
            expect(response.provider).toBe('openai');
        });
    });
});
