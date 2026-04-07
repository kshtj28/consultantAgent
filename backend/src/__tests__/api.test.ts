import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { json } from 'body-parser';

// Create test app
const createTestApp = () => {
    const app = express();
    app.use(json());
    return app;
};

// Mock services
vi.mock('../services/knowledgeBase', () => ({
    processAndIndexDocument: vi.fn().mockResolvedValue('mock-doc-id'),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    listDocuments: vi.fn().mockResolvedValue([
        {
            documentId: 'doc-1',
            filename: 'test.pdf',
            fileType: 'application/pdf',
            uploadedAt: new Date(),
            totalChunks: 5,
        },
    ]),
    searchKnowledgeBase: vi.fn().mockResolvedValue([
        {
            content: 'Test content',
            score: 0.9,
            filename: 'test.pdf',
            chunkIndex: 0,
            entities: [],
        },
    ]),
    hybridSearch: vi.fn().mockResolvedValue([
        {
            content: 'Test content',
            score: 0.9,
            filename: 'test.pdf',
            chunkIndex: 0,
            entities: [],
        },
    ]),
}));

vi.mock('../services/documentProcessor', () => ({
    processDocument: vi.fn().mockResolvedValue({
        content: 'Parsed document content',
        metadata: { wordCount: 100, characterCount: 500 },
    }),
    isValidFileType: vi.fn().mockReturnValue(true),
    getFileType: vi.fn().mockReturnValue('application/pdf'),
}));

vi.mock('../services/memory', () => ({
    createConversation: vi.fn().mockResolvedValue('conv-123'),
    getConversation: vi.fn().mockResolvedValue({
        conversationId: 'conv-123',
        userId: 'user-1',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    }),
    addMessage: vi.fn().mockResolvedValue(undefined),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    listConversations: vi.fn().mockResolvedValue([]),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    formatMessagesForLLM: vi.fn().mockReturnValue([]),
}));

vi.mock('../services/analysisService', () => ({
    generateGapAnalysis: vi.fn().mockResolvedValue({
        executiveSummary: 'Test summary',
        currentStateAssessment: {
            processInventory: ['Process A'],
            painPoints: ['Manual data entry'],
            stakeholderImpact: ['Finance team'],
        },
        gapIdentification: {
            processGaps: [{ gap: 'Gap 1', impact: 'high', description: 'Test' }],
            technologyGaps: [],
            capabilityGaps: [],
        },
        recommendations: [],
        implementationRoadmap: { quickWins: [], mediumTerm: [], longTerm: [] },
        riskAssessment: [],
    }),
    generateProjectPlan: vi.fn().mockResolvedValue({
        projectName: 'Test Project',
        objective: 'Test objective',
        scope: ['Item 1'],
        phases: [],
        resourceRequirements: [],
        successCriteria: [],
        timeline: '3 months',
    }),
    identifyAutomationOpportunities: vi.fn().mockResolvedValue([
        {
            title: 'Automation 1',
            description: 'Description',
            automationPotential: true,
            priority: 'high',
            estimatedEffort: '2 weeks',
        },
    ]),
}));

vi.mock('../config/env', () => ({
    env: {
        OPENAI_API_KEY: 'test-key',
        UPLOAD_DIR: '/tmp/uploads',
        MAX_FILE_SIZE: '10485760',
    },
}));

vi.mock('openai', () => ({
    default: vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: vi.fn().mockResolvedValue({
                    choices: [{ message: { content: 'AI response message' } }],
                }),
            },
        },
    })),
}));

describe('API Endpoints', () => {
    describe('Documents API', () => {
        it('should list documents', async () => {
            const { listDocuments } = await import('../services/knowledgeBase');

            const app = createTestApp();
            app.get('/api/documents', async (req, res) => {
                const documents = await listDocuments();
                res.json({ documents });
            });

            const response = await request(app).get('/api/documents');

            expect(response.status).toBe(200);
            expect(response.body.documents).toHaveLength(1);
            expect(response.body.documents[0].filename).toBe('test.pdf');
        });

        it('should delete document', async () => {
            const { deleteDocument } = await import('../services/knowledgeBase');

            const app = createTestApp();
            app.delete('/api/documents/:documentId', async (req, res) => {
                await deleteDocument(req.params.documentId);
                res.json({ success: true });
            });

            const response = await request(app).delete('/api/documents/doc-123');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('Chat API', () => {
        it('should create conversation', async () => {
            const { createConversation } = await import('../services/memory');

            const app = createTestApp();
            app.post('/api/chat/conversations', async (req, res) => {
                const conversationId = await createConversation(req.body.userId || 'default');
                res.status(201).json({ conversationId });
            });

            const response = await request(app)
                .post('/api/chat/conversations')
                .send({ userId: 'user-1' });

            expect(response.status).toBe(201);
            expect(response.body.conversationId).toBe('conv-123');
        });

        it('should get conversation', async () => {
            const { getConversation } = await import('../services/memory');

            const app = createTestApp();
            app.get('/api/chat/conversations/:conversationId', async (req, res) => {
                const conversation = await getConversation(req.params.conversationId);
                if (!conversation) {
                    return res.status(404).json({ error: 'Not found' });
                }
                res.json(conversation);
            });

            const response = await request(app).get('/api/chat/conversations/conv-123');

            expect(response.status).toBe(200);
            expect(response.body.conversationId).toBe('conv-123');
        });
    });

    describe('Analysis API', () => {
        it('should generate gap analysis', async () => {
            const { generateGapAnalysis } = await import('../services/analysisService');

            const app = createTestApp();
            app.post('/api/chat/analyze/gap', async (req, res) => {
                const report = await generateGapAnalysis(req.body.focusArea, req.body.context || '');
                res.json({ report });
            });

            const response = await request(app)
                .post('/api/chat/analyze/gap')
                .send({ focusArea: 'Invoice Processing' });

            expect(response.status).toBe(200);
            expect(response.body.report.executiveSummary).toBe('Test summary');
        });

        it('should generate project plan', async () => {
            const { generateProjectPlan } = await import('../services/analysisService');

            const app = createTestApp();
            app.post('/api/chat/analyze/plan', async (req, res) => {
                const plan = await generateProjectPlan(req.body.gaps, req.body.timeline || 'medium');
                res.json({ plan });
            });

            const response = await request(app)
                .post('/api/chat/analyze/plan')
                .send({ gaps: ['Gap 1', 'Gap 2'], timeline: 'short' });

            expect(response.status).toBe(200);
            expect(response.body.plan.projectName).toBe('Test Project');
        });

        it('should identify automation opportunities', async () => {
            const { identifyAutomationOpportunities } = await import('../services/analysisService');

            const app = createTestApp();
            app.post('/api/chat/analyze/automation', async (req, res) => {
                const opportunities = await identifyAutomationOpportunities(req.body.processDescription);
                res.json({ opportunities });
            });

            const response = await request(app)
                .post('/api/chat/analyze/automation')
                .send({ processDescription: 'Manual invoice data entry' });

            expect(response.status).toBe(200);
            expect(response.body.opportunities).toHaveLength(1);
            expect(response.body.opportunities[0].automationPotential).toBe(true);
        });
    });
});
