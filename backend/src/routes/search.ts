import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/search?q=term
router.get('/', async (req: Request, res: Response) => {
    const user = (req as AuthRequest).user;
    const q = (req.query.q as string || '').trim();

    if (!q || q.length < 2) {
        return res.json({ results: [] });
    }

    const results: any[] = [];

    // Search sessions (readiness_sessions index)
    try {
        const sessExists = await opensearchClient.indices.exists({ index: 'readiness_sessions' });
        if (sessExists.body) {
            const sessResult = await opensearchClient.search({
                index: 'readiness_sessions',
                body: {
                    query: {
                        bool: {
                            should: [
                                { wildcard: { sessionId: `*${q.toLowerCase()}*` } },
                                { match: { currentArea: q } },
                                { match: { status: q } },
                            ],
                            minimum_should_match: 1,
                        },
                    },
                    size: 5,
                },
            });
            for (const hit of sessResult.body.hits.hits || []) {
                const s = hit._source;
                results.push({
                    type: 'session',
                    id: s.sessionId || hit._id,
                    title: `Readiness Session — ${new Date(s.createdAt || Date.now()).toLocaleDateString()}`,
                    snippet: `Status: ${s.status} | Areas: ${(s.selectedAreas || []).join(', ')}`,
                    url: '/process-analysis',
                });
            }
        }
    } catch (e) { /* index may not exist */ }

    // Search documents
    try {
        const docResult = await opensearchClient.search({
            index: INDICES.DOCUMENTS,
            body: {
                query: {
                    bool: {
                        should: [
                            { match: { filename: q } },
                            { match: { content: q } },
                        ],
                        minimum_should_match: 1,
                    },
                },
                size: 5,
                _source: ['documentId', 'filename', 'fileType', 'uploadedAt', 'content'],
            },
        });

        // Deduplicate by documentId (multiple chunks per doc)
        const seen = new Set<string>();
        for (const hit of docResult.body.hits.hits || []) {
            const d = hit._source;
            if (seen.has(d.documentId)) continue;
            seen.add(d.documentId);
            const snippet = (d.content || '').substring(0, 120) + '...';
            results.push({
                type: 'document',
                id: d.documentId,
                title: d.filename,
                snippet,
                url: '/sme-engagement',
            });
        }
    } catch (e) { /* ignore */ }

    // Search users (admin only)
    if (user?.role === 'admin') {
        try {
            const userResult = await opensearchClient.search({
                index: INDICES.USERS,
                body: {
                    query: {
                        bool: {
                            should: [
                                { wildcard: { username: `*${q.toLowerCase()}*` } },
                                { match: { firstName: q } },
                                { match: { lastName: q } },
                                { match: { organization: q } },
                            ],
                            minimum_should_match: 1,
                        },
                    },
                    size: 5,
                    _source: ['userId', 'username', 'firstName', 'lastName', 'role', 'organization'],
                },
            });
            for (const hit of userResult.body.hits.hits || []) {
                const u = hit._source;
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
                results.push({
                    type: 'user',
                    id: u.userId,
                    title: name,
                    snippet: `${u.role} | ${u.organization || 'No org'}`,
                    url: '/admin/users',
                });
            }
        } catch (e) { /* ignore */ }
    }

    res.json({ results });
});

export default router;
