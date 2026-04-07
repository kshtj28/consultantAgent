import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';

const router = Router();

// GET /api/users/profiles — list basic user profiles (any authenticated user)
router.get('/profiles', async (_req: Request, res: Response) => {
    try {
        const response = await opensearchClient.search({
            index: INDICES.USERS,
            body: {
                query: { match_all: {} },
                size: 1000,
                sort: [{ createdAt: { order: 'desc', unmapped_type: 'date' } }],
                _source: [
                    'userId', 'username', 'firstName', 'lastName',
                    'organization', 'department', 'role', 'status',
                    'createdAt', 'lastLoginAt',
                ],
            },
        });

        const users = response.body.hits.hits.map((hit: any) => ({
            _id: hit._id,
            ...hit._source,
        }));

        res.json({ users });
    } catch (error: any) {
        console.error('Error fetching user profiles:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
