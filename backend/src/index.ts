import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';
import { env } from './config/env';
import { initializeIndices, opensearchClient, INDICES } from './config/database';
import documentRoutes from './routes/documents';
import chatRoutes from './routes/chat';
import interviewRoutes from './routes/interview';
import interviewAttachmentRoutes from './routes/interviewAttachments';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import sessionsRoutes from './routes/sessions';
import notificationRoutes from './routes/notifications';
import searchRoutes from './routes/search';
import risksRoutes from './routes/risks';
import dashboardRoutes from './routes/dashboard';
import reportsRouter from './routes/reports';
import settingsRoutes from './routes/settings';
import usersRoutes from './routes/users';
import smeEngagementRoutes from './routes/smeEngagement';
import multiSMEConsolidationRoutes from './routes/multiSMEConsolidation';
import insightsRoutes from './routes/insights';
import connectorsRoutes from './routes/connectors';
import { authenticateToken } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';

const app = express();
const port = parseInt(env.PORT, 10);

// Middleware
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root route - API info
app.get('/', (req, res) => {
    res.json({
        name: 'Consultant Agent API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            auth: {
                login: 'POST /api/auth/login',
                register: 'POST /api/auth/register',
                validate: 'GET /api/auth/validate',
            },
            health: 'GET /health',
            documents: {
                upload: 'POST /api/documents/upload',
                list: 'GET /api/documents',
                delete: 'DELETE /api/documents/:id',
            },
            chat: {
                models: 'GET /api/chat/models',
                createConversation: 'POST /api/chat/conversations',
                sendMessage: 'POST /api/chat/message',
                streamMessage: 'POST /api/chat/message/stream',
                gapAnalysis: 'POST /api/chat/analyze/gap',
                projectPlan: 'POST /api/chat/analyze/plan',
                automation: 'POST /api/chat/analyze/automation',
            },
            admin: {
                auditLogs: 'GET /api/admin/audit-logs',
                users: 'GET /api/admin/users',
                updateUser: 'PUT /api/admin/users/:id',
                deleteUser: 'DELETE /api/admin/users/:id',
            },
            notifications: {
                stream: 'GET /api/notifications/stream',
                list: 'GET /api/notifications',
                markRead: 'PUT /api/notifications/:id/read',
            },
            search: 'GET /api/search?q=term',
            risks: 'GET /api/risks/summary',
        },
        frontend: 'http://localhost:3000',
    });
});

// API Routes
app.use('/api/auth', authRoutes);

// Protected Routes (with audit middleware for mutation tracking)
app.use('/api/admin', authenticateToken, auditMiddleware, adminRoutes);
app.use('/api/documents', authenticateToken, auditMiddleware, documentRoutes);
app.use('/api/chat', authenticateToken, auditMiddleware, chatRoutes);
app.use('/api/interview', authenticateToken, auditMiddleware, interviewRoutes);
app.use('/api/interview', authenticateToken, interviewAttachmentRoutes);
app.use('/api', authenticateToken, auditMiddleware, sessionsRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);
app.use('/api/search', authenticateToken, searchRoutes);
app.use('/api/risks', authenticateToken, risksRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/reports', authenticateToken, reportsRouter);
app.use('/api/sme-engagement', authenticateToken, smeEngagementRoutes);
app.use('/api/multi-sme-consolidation', authenticateToken, multiSMEConsolidationRoutes);
app.use('/api/insights', authenticateToken, insightsRoutes);
app.use('/api/connectors', authenticateToken, connectorsRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/users', authenticateToken, usersRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
});

// Initialize and start server
async function startServer() {
    try {
        // Initialize OpenSearch indices
        console.log('🔧 Initializing OpenSearch indices...');
        await initializeIndices();

        // Clean up stale generating reports (from server restarts mid-workflow)
        async function cleanupStaleReports() {
          try {
            const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
            await opensearchClient.updateByQuery({
              index: INDICES.REPORTS,
              body: {
                query: {
                  bool: {
                    must: [
                      { match: { status: 'generating' } },
                      { range: { updatedAt: { lt: fifteenMinAgo } } },
                    ],
                  },
                },
                script: {
                  source: "ctx._source.status = 'failed'; ctx._source.updatedAt = params.now",
                  params: { now: new Date().toISOString() },
                },
              },
            });
          } catch (err) {
            console.error('Stale report cleanup failed:', err);
          }
        }

        await cleanupStaleReports();

        // Start server
        app.listen(port, () => {
            console.log(`🚀 Consultant Agent API running on http://localhost:${port}`);
            console.log(`📚 API Endpoints:`);
            console.log(`   POST   /api/documents/upload    - Upload documents`);
            console.log(`   GET    /api/documents           - List documents`);
            console.log(`   DELETE /api/documents/:id       - Delete document`);
            console.log(`   POST   /api/chat/conversations  - Create conversation`);
            console.log(`   POST   /api/chat/message        - Send message`);
            console.log(`   POST   /api/chat/message/stream - Stream message`);
            console.log(`   POST   /api/chat/analyze/gap    - Generate gap analysis`);
            console.log(`   POST   /api/chat/analyze/plan   - Generate project plan`);
            console.log(`   POST   /api/chat/analyze/automation - Find automation opportunities`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

export default app;