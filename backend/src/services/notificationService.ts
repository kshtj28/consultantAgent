import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';

// Track active SSE connections per userId
const sseClients = new Map<string, Set<Response>>();

export interface NotificationPayload {
    userId: string;
    type: 'session_completed' | 'report_generated' | 'risk_identified' | 'user_created';
    title: string;
    message: string;
    resourceType?: string;
    resourceId?: string;
}

export async function createNotification(payload: NotificationPayload): Promise<void> {
    const notification = {
        notificationId: uuidv4(),
        ...payload,
        read: false,
        createdAt: new Date().toISOString(),
    };

    try {
        await opensearchClient.index({
            index: INDICES.NOTIFICATIONS,
            body: notification,
            refresh: false,
        });

        // Push to SSE clients for this user
        const clients = sseClients.get(payload.userId);
        if (clients) {
            const data = JSON.stringify(notification);
            for (const client of clients) {
                client.write(`data: ${data}\n\n`);
            }
        }

        // Also push to all admin users' streams
        // We broadcast to a special 'admin' channel
        const adminClients = sseClients.get('__admin__');
        if (adminClients && payload.type !== 'user_created') {
            const data = JSON.stringify(notification);
            for (const client of adminClients) {
                client.write(`data: ${data}\n\n`);
            }
        }
    } catch (err: any) {
        console.warn('Failed to create notification:', err.message);
    }
}

export function addSSEClient(userId: string, role: string, res: Response): void {
    if (!sseClients.has(userId)) {
        sseClients.set(userId, new Set());
    }
    sseClients.get(userId)!.add(res);

    // Admin users also subscribe to admin broadcast channel
    if (role === 'admin') {
        if (!sseClients.has('__admin__')) {
            sseClients.set('__admin__', new Set());
        }
        sseClients.get('__admin__')!.add(res);
    }

    res.on('close', () => {
        sseClients.get(userId)?.delete(res);
        if (role === 'admin') {
            sseClients.get('__admin__')?.delete(res);
        }
    });
}
