import { Request, Response, NextFunction } from 'express';
import { opensearchClient, INDICES } from '../config/database';
import { AuthRequest } from './auth';
import { v4 as uuidv4 } from 'uuid';

function getResourceType(path: string): string {
    if (path.includes('/readiness')) return 'session';
    if (path.includes('/documents')) return 'document';
    if (path.includes('/auth')) return 'user';
    if (path.includes('/interview')) return 'interview';
    if (path.includes('/chat')) return 'analysis';
    if (path.includes('/admin/users')) return 'user';
    if (path.includes('/notifications')) return 'notification';
    return 'unknown';
}

function getResourceId(path: string): string | null {
    // Extract ID-like segments from URL (UUIDs or similar)
    const segments = path.split('/');
    for (const seg of segments) {
        if (seg.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/i) || seg.match(/^[a-z0-9]{20,}/i)) {
            return seg;
        }
    }
    return null;
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
    // Only audit mutating requests
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
        return next();
    }

    const user = (req as AuthRequest).user;
    const action = `${req.method} ${req.originalUrl?.split('?')[0] || req.path}`;
    const resource = getResourceType(req.path);
    const resourceId = getResourceId(req.path);

    // Capture response to log after completion
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
        // Fire and forget audit log
        const auditEntry = {
            auditId: uuidv4(),
            userId: user?.userId || 'anonymous',
            username: user?.username || 'anonymous',
            role: user?.role || 'unknown',
            action,
            resource,
            resourceId: resourceId || body?.userId || body?.sessionId || body?.session?.sessionId || null,
            details: JSON.stringify(req.body || {}).substring(0, 1000),
            statusCode: res.statusCode,
            ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
            timestamp: new Date().toISOString(),
        };

        opensearchClient.index({
            index: INDICES.AUDIT_LOGS,
            body: auditEntry,
            refresh: false,
        }).catch((err: any) => {
            console.warn('Audit log write failed:', err.message);
        });

        return originalJson(body);
    } as any;

    next();
}
