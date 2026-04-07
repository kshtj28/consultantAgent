import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';
import { env } from '../config/env';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();
const JWT_SECRET = env.JWT_SECRET || 'consultant-agent-secret';

// Helper to find user by userId
async function findUserById(userId: string) {
    try {
        const response = await opensearchClient.search({
            index: INDICES.USERS,
            body: {
                query: { term: { userId: { value: userId } } },
                size: 1,
            },
        });
        if (response.body.hits.total.value > 0) {
            return response.body.hits.hits[0]._source;
        }
    } catch (_) { /* ignore */ }
    return null;
}

// Helper to find user by username
async function findUserByUsername(username: string) {
    const response = await opensearchClient.search({
        index: INDICES.USERS,
        body: {
            query: {
                term: {
                    username: {
                        value: username,
                    },
                },
            },
        },
    });

    if (response.body.hits.total.value > 0) {
        return response.body.hits.hits[0]._source;
    }
    return null;
}

// Register
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { username, password, firstName, lastName, organization } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const existingUser = await findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const user = {
            userId,
            username,
            passwordHash: hashedPassword,
            role: 'user', // Default role
            firstName: firstName || '',
            lastName: lastName || '',
            organization: organization || '',
            department: '',
            status: 'active',
            language: 'en',
            createdAt: new Date().toISOString(),
        };

        await opensearchClient.index({
            index: INDICES.USERS,
            body: user,
            refresh: true,
        });

        res.status(201).json({ message: 'User created successfully', userId });
    } catch (error: any) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: error.message });
    }
});


// Create User (Admin only)
router.post('/create-user', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
    try {
        const { username, password, role = 'user', firstName, lastName, organization, department } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const validRoles = ['user', 'admin', 'analyst'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
        }

        if (username === 'admin') {
            return res.status(400).json({ error: 'Username already exists' });
        }
        const existingUser = await findUserByUsername(username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();
        const user = {
            userId,
            username,
            passwordHash: hashedPassword,
            role,
            firstName: firstName || '',
            lastName: lastName || '',
            organization: organization || '',
            department: department || '',
            status: 'active',
            language: 'en',
            createdAt: new Date().toISOString(),
        };

        await opensearchClient.index({
            index: INDICES.USERS,
            body: user,
            refresh: true,
        });

        res.status(201).json({ message: 'User created successfully', userId });
    } catch (error: any) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Check for Env-based Admin Login (Fallback/Bootstrap)
        if (username === 'admin' && env.ADMIN_PASSWORD && password === env.ADMIN_PASSWORD) {
            const token = jwt.sign(
                { userId: 'admin-env-user', username: 'admin', role: 'admin' },
                JWT_SECRET,
                { expiresIn: '24h' }
            );
            return res.json({ token, user: { userId: 'admin-env-user', username: 'admin', role: 'admin', language: 'en' } });
        }

        const user: any = await findUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        try {
            await opensearchClient.updateByQuery({
                index: INDICES.USERS,
                body: {
                    script: {
                        source: 'ctx._source.lastLoginAt = params.now',
                        lang: 'painless',
                        params: {
                            now: new Date().toISOString()
                        }
                    },
                    query: {
                        term: {
                            userId: user.userId
                        }
                    }
                }
            });
        } catch (updateError) {
            console.warn('Failed to update last login time:', updateError);
            // Continue login even if update fails
        }

        const token = jwt.sign(
            { userId: user.userId, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const { passwordHash: _, ...userWithoutPassword } = user;
        res.json({ token, user: { language: 'en', ...userWithoutPassword } });
    } catch (error: any) {
        console.error('Error logging in:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user preferences (authenticated)
router.put('/preferences', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { language } = req.body;
        const allowedLanguages = ['en', 'hi', 'ar'];

        if (!language || !allowedLanguages.includes(language)) {
            return res.status(400).json({ error: 'Must provide a valid language' });
        }

        const userId = (req as any).user?.userId;

        await opensearchClient.updateByQuery({
            index: INDICES.USERS,
            body: {
                script: {
                    source: 'ctx._source.language = params.language',
                    lang: 'painless',
                    params: { language },
                },
                query: {
                    term: { userId },
                },
            },
        });

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: error.message });
    }
});

// Validate Token (for Nginx auth_request)
router.get('/validate', authenticateToken, async (req: Request, res: Response) => {
    const jwtUser = (req as any).user;
    try {
        const fullUser = await findUserById(jwtUser.userId);
        if (fullUser) {
            const { passwordHash: _, ...userWithoutPassword } = fullUser;
            return res.status(200).json({ valid: true, user: { ...jwtUser, ...userWithoutPassword } });
        }
    } catch (_) { /* fall through */ }
    res.status(200).json({ valid: true, user: jwtUser });
});

export default router;
