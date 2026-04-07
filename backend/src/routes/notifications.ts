import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { addSSEClient } from '../services/notificationService';

const router = Router();

// GET /stream — SSE endpoint
router.get('/stream', (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (!user) return res.sendStatus(401);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });

    // Send initial heartbeat
    res.write('data: {"type":"connected"}\n\n');

    addSSEClient(user.userId, user.role, res);

    // Keep alive every 30 seconds
    const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
        clearInterval(keepAlive);
    });
});

// GET / — list notifications for current user
router.get('/', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    if (!user) return res.sendStatus(401);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    try {
        const query: any = user.role === 'admin'
            ? { match_all: {} }
            : { term: { userId: user.userId } };

        const result = await opensearchClient.search({
            index: INDICES.NOTIFICATIONS,
            body: {
                query,
                sort: [{ createdAt: { order: 'desc' } }],
                from: (page - 1) * limit,
                size: limit,
            },
        });

        const hits = result.body.hits.hits || [];
        const notifications = hits.map((h: any) => h._source);
        const total = result.body.hits.total?.value || 0;

        // Count unread
        const unreadResult = await opensearchClient.count({
            index: INDICES.NOTIFICATIONS,
            body: {
                query: {
                    bool: {
                        must: [
                            user.role === 'admin' ? { match_all: {} } : { term: { userId: user.userId } },
                            { term: { read: false } },
                        ],
                    },
                },
            },
        });

        res.json({
            notifications,
            total,
            unreadCount: unreadResult.body.count || 0,
            page,
            limit,
        });
    } catch (err: any) {
        // Index might not exist yet
        if (err.meta?.statusCode === 404) {
            return res.json({ notifications: [], total: 0, unreadCount: 0, page, limit });
        }
        console.error('Error fetching notifications:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /:id/read — mark notification as read
router.put('/:id/read', async (req: Request, res: Response) => {
    try {
        await opensearchClient.updateByQuery({
            index: INDICES.NOTIFICATIONS,
            body: {
                script: {
                    source: 'ctx._source.read = true',
                    lang: 'painless',
                },
                query: {
                    term: { notificationId: req.params.id },
                },
            },
            refresh: true,
        });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Error marking notification read:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /read-all — mark all notifications as read for current user
router.put('/read-all', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    try {
        await opensearchClient.updateByQuery({
            index: INDICES.NOTIFICATIONS,
            body: {
                script: {
                    source: 'ctx._source.read = true',
                    lang: 'painless',
                },
                query: {
                    bool: {
                        must: [
                            { term: { userId: user.userId } },
                            { term: { read: false } },
                        ],
                    },
                },
            },
            refresh: true,
        });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Error marking all read:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
