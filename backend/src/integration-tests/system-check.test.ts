
import { describe, it, expect, beforeAll } from 'vitest';
import { llmFactory } from '../services/llm/LLMProvider';
import { generateCompletion } from '../services/llmService';
import { opensearchClient } from '../config/database';
import { env } from '../config/env';

describe('System Integration Checks', () => {

    describe('LLM Configuration', () => {
        it('should have Ollama configured as default provider', () => {
            const provider = llmFactory.getDefault();
            expect(provider.name).toBe('ollama');
        });

        it('should have correct base URL for Ollama', () => {
            const provider = llmFactory.getDefault() as any;
            // Accessing private property via any cast strictly for testing verification
            const expectedUrl = env.OLLAMA_BASE_URL || 'http://localhost:11434';
            expect(provider.baseUrl).toContain(expectedUrl);
        });

        it('should have correct model configured', () => {
            const provider = llmFactory.getDefault() as any;
            // Accept any of the configured models
            expect(['gemma3', 'gemma3:1b', 'gemma3:4b', 'gemma3:12b', 'gpt-oss:20b']).toContain(provider.model);
        });
    });

    describe('Ollama Connectivity', () => {
        it('should be able to connect to Ollama server', async () => {
            const provider = llmFactory.getDefault();
            const isAvailable = await provider.isAvailable();
            // Note: isAvailable() in OllamaProvider just checks env var, so let's try a real health check
            if ('checkHealth' in provider) {
                const health = await (provider as any).checkHealth();
                expect(health).toBe(true);
            }
        });

        it('should list available models', async () => {
            const provider = llmFactory.getDefault();
            if ('listModels' in provider) {
                const models = await (provider as any).listModels();
                expect(Array.isArray(models)).toBe(true);
                expect(models.length).toBeGreaterThan(0);
                console.log('Available models:', models);
            }
        });
    });

    describe('Generation Capabilities', () => {
        it('should generate text completion', async () => {
            const response = await generateCompletion([
                { role: 'user', content: 'Say "hello world" in lowercase' }
            ]);

            expect(response).toBeDefined();
            expect(response.content).toBeDefined();
            expect(response.content.length).toBeGreaterThan(0);
            expect(response.model).toBeDefined();
            console.log('Generation response:', response.content);
        }, 10000); // 10s timeout
    });

    describe('Embedding Capabilities', () => {
        it('should generate embeddings via Ollama', async () => {
            const provider = llmFactory.getDefault();

            if (provider.embed) {
                const vector = await provider.embed('Test embedding generation');
                expect(Array.isArray(vector)).toBe(true);
                expect(vector.length).toBeGreaterThan(0);
                console.log('Embedding dimension:', vector.length);
            } else {
                throw new Error('Default provider does not support embeddings');
            }
        }, 30000);
    });

    describe('Database Connectivity', () => {
        it('should connect to OpenSearch', async () => {
            const health = await opensearchClient.cluster.health();
            expect(health.body.status).not.toBe('red');
        });
    });
});
