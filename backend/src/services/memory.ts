import { v4 as uuidv4 } from 'uuid';
import { opensearchClient, INDICES } from '../config/database';

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

export interface Conversation {
    conversationId: string;
    userId: string;
    username?: string;
    messages: Message[];
    context: string;
    createdAt: Date;
    updatedAt: Date;
}

// Create a new conversation
export async function createConversation(userId: string, username: string = 'unknown'): Promise<string> {
    const conversationId = uuidv4();

    await opensearchClient.index({
        index: INDICES.CONVERSATIONS,
        id: conversationId,
        body: {
            conversationId,
            userId,
            username,
            messages: [],
            context: '',
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        refresh: true,
    });

    return conversationId;
}

// Get conversation by ID
export async function getConversation(conversationId: string): Promise<Conversation | null> {
    try {
        const response = await opensearchClient.get({
            index: INDICES.CONVERSATIONS,
            id: conversationId,
        });
        return response.body._source as Conversation;
    } catch (error: any) {
        if (error.meta?.statusCode === 404) {
            return null;
        }
        throw error;
    }
}

// Add message to conversation
export async function addMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
): Promise<void> {
    const message: Message = {
        role,
        content,
        timestamp: new Date(),
    };

    await opensearchClient.update({
        index: INDICES.CONVERSATIONS,
        id: conversationId,
        body: {
            script: {
                source: `
          ctx._source.messages.add(params.message);
          ctx._source.updatedAt = params.updatedAt;
        `,
                params: {
                    message,
                    updatedAt: new Date(),
                },
            },
        },
        refresh: true,
    });
}

// Get recent messages for context
export async function getRecentMessages(
    conversationId: string,
    limit: number = 10
): Promise<Message[]> {
    const conversation = await getConversation(conversationId);
    if (!conversation) {
        return [];
    }

    const messages = conversation.messages || [];
    return messages.slice(-limit);
}

// Update conversation context
export async function updateContext(
    conversationId: string,
    context: string
): Promise<void> {
    await opensearchClient.update({
        index: INDICES.CONVERSATIONS,
        id: conversationId,
        body: {
            doc: {
                context,
                updatedAt: new Date(),
            },
        },
        refresh: true,
    });
}

// List user conversations
export async function listConversations(userId: string): Promise<Conversation[]> {
    const response = await opensearchClient.search({
        index: INDICES.CONVERSATIONS,
        body: {
            query: {
                term: { userId },
            },
            sort: [{ updatedAt: { order: 'desc' } }],
            size: 50,
        },
    });

    return response.body.hits.hits.map((hit: any) => hit._source as Conversation);
}

// Delete conversation
export async function deleteConversation(conversationId: string): Promise<void> {
    await opensearchClient.delete({
        index: INDICES.CONVERSATIONS,
        id: conversationId,
        refresh: true,
    });
}

// Format messages for LLM context
export function formatMessagesForLLM(messages: Message[]): { role: string; content: string }[] {
    return messages.map((m) => ({
        role: m.role,
        content: m.content,
    }));
}
