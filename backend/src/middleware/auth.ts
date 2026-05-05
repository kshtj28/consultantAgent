import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface AuthRequest extends Request {
    user?: any;
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    // Support token via query param for SSE (EventSource can't set headers)
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Default to a secure secret if not provided in env (for dev simplicity, but warn)
    const secret = env.JWT_SECRET || 'consultant-agent-secret';

    jwt.verify(token, secret, (err: any, user: any) => {
        if (err) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        (req as AuthRequest).user = user;
        next();

    });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const user = (req as AuthRequest).user;
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

export function requireRole(...roles: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as AuthRequest).user;
        if (!user || !roles.includes(user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}
