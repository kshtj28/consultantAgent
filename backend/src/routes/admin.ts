import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { requireRole } from '../middleware/auth';

const router = Router();

// GET /audit-logs - Admin only, paginated
router.get('/audit-logs', requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const from = (page - 1) * limit;

        const must: any[] = [];

        if (req.query.userId) {
            must.push({ term: { userId: req.query.userId } });
        }
        if (req.query.action) {
            must.push({ term: { action: req.query.action } });
        }
        if (req.query.resource) {
            must.push({ term: { resource: req.query.resource } });
        }
        if (req.query.from || req.query.to) {
            const range: any = {};
            if (req.query.from) range.gte = req.query.from;
            if (req.query.to) range.lte = req.query.to;
            must.push({ range: { timestamp: range } });
        }

        const query = must.length > 0 ? { bool: { must } } : { match_all: {} };

        const response = await opensearchClient.search({
            index: INDICES.AUDIT_LOGS,
            body: {
                query,
                sort: [{ timestamp: { order: 'desc' } }],
                from,
                size: limit,
            },
        });

        const total = response.body.hits.total.value;
        const logs = response.body.hits.hits.map((hit: any) => hit._source);

        res.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error: any) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /users - Admin only, list all users
router.get('/users', requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const response = await opensearchClient.search({
            index: INDICES.USERS,
            body: {
                query: { match_all: {} },
                size: 1000,
                sort: [{ createdAt: { order: 'desc' } }],
            },
        });

        const users = response.body.hits.hits.map((hit: any) => {
            const { passwordHash, ...userWithoutPassword } = hit._source;
            return { _id: hit._id, ...userWithoutPassword };
        });

        res.json({ users });
    } catch (error: any) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT /users/:id - Admin only, update user fields
router.put('/users/:id', requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, organization, department, role, status } = req.body;

        const scriptParts: string[] = [];
        const params: any = {};

        if (firstName !== undefined) {
            scriptParts.push('ctx._source.firstName = params.firstName');
            params.firstName = firstName;
        }
        if (lastName !== undefined) {
            scriptParts.push('ctx._source.lastName = params.lastName');
            params.lastName = lastName;
        }
        if (organization !== undefined) {
            scriptParts.push('ctx._source.organization = params.organization');
            params.organization = organization;
        }
        if (department !== undefined) {
            scriptParts.push('ctx._source.department = params.department');
            params.department = department;
        }
        if (role !== undefined) {
            scriptParts.push('ctx._source.role = params.role');
            params.role = role;
        }
        if (status !== undefined) {
            scriptParts.push('ctx._source.status = params.status');
            params.status = status;
        }

        if (scriptParts.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const response = await opensearchClient.updateByQuery({
            index: INDICES.USERS,
            refresh: true,
            body: {
                script: {
                    source: scriptParts.join('; '),
                    lang: 'painless',
                    params,
                },
                query: {
                    bool: {
                        should: [
                            { term: { userId: id } },
                            { term: { 'userId.keyword': id } },
                        ],
                        minimum_should_match: 1,
                    },
                },
            },
        });

        if (response.body.updated === 0) {
            return res.status(404).json({ error: 'User not found or no changes applied' });
        }

        res.json({ success: true, updated: response.body.updated });
    } catch (error: any) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /users/:id - Admin only, soft-delete (set status to inactive)
router.delete('/users/:id', requireRole('admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const response = await opensearchClient.updateByQuery({
            index: INDICES.USERS,
            refresh: true,
            body: {
                script: {
                    source: "ctx._source.status = 'inactive'",
                    lang: 'painless',
                },
                query: {
                    bool: {
                        should: [
                            { term: { userId: id } },
                            { term: { 'userId.keyword': id } },
                        ],
                        minimum_should_match: 1,
                    },
                },
            },
        });

        if (response.body.updated === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'User deactivated successfully' });
    } catch (error: any) {
        console.error('Error deactivating user:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
