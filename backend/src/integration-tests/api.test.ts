
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { env } from '../config/env';

// Determine base URL - prefer configured port or default to 3001
const PORT = env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}`;

describe('API Integration Tests', () => {

    describe('Health Check', () => {
        it('should return 200 OK for /health', async () => {
            const response = await request(BASE_URL).get('/health');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'healthy');
        });

        it('should return API info for root /', async () => {
            const response = await request(BASE_URL).get('/');
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('name', 'Consultant Agent API');
        });
    });

    describe('Documents API', () => {
        it('should list documents (empty initially or existing)', async () => {
            const response = await request(BASE_URL).get('/api/documents');
            expect(response.status).toBe(200);
            // Response is wrapped in { documents: [] }
            expect(response.body).toHaveProperty('documents');
            expect(Array.isArray(response.body.documents)).toBe(true);
        });

        // Skip upload test for now to avoid needing a dummy file, but can be added if critical
    });

    describe('Chat API', () => {
        let conversationId: string;

        it('should create a conversation', async () => {
            const response = await request(BASE_URL)
                .post('/api/chat/conversations')
                .send({ userId: 'test-user' });

            // Returns 201 Created
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('conversationId');
            conversationId = response.body.conversationId;
        });

        it('should send a message to the conversation', async () => {
            // Ensure we have a conversation (or create one if previous test failed/ran separately)
            if (!conversationId) {
                const setupRes = await request(BASE_URL)
                    .post('/api/chat/conversations')
                    .send({ userId: 'test-user' });
                conversationId = setupRes.body.conversationId;
            }

            const response = await request(BASE_URL)
                .post('/api/chat/message')
                .send({
                    conversationId,
                    message: 'Hello', // Keep it simple
                    userId: 'test-user'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');
        }, 30000); // Increased timeout to 30s
    });

    describe('Readiness API', () => {
        it('should list readiness areas', async () => {
            const response = await request(BASE_URL).get('/api/readiness/areas');
            expect(response.status).toBe(200);
            // Wrapped in { areas: [] }
            expect(response.body).toHaveProperty('areas');
            expect(Array.isArray(response.body.areas)).toBe(true);
        });

        it('should start a readiness assessment', async () => {
            const response = await request(BASE_URL)
                .post('/api/readiness/start')
                .send({ userId: 'test-user' });

            expect(response.status).toBe(200);
            // Returns { session: { sessionId: ... } }
            expect(response.body.session).toHaveProperty('sessionId');
        });
    });

});
