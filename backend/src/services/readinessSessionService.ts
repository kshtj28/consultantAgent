/**
 * @deprecated All session management has been migrated to interviewService.ts.
 * Kept for reference during migration period — safe to delete after migration is verified.
 */
import { v4 as uuidv4 } from 'uuid';
import { opensearchClient } from '../config/database';
import { LanguageCode, isValidLanguage } from './languageService';
import { getDomainAreas, getDomainArea, getActiveDomainId } from './domainService';

export type AreaId = string;

// Question types
export type QuestionType = 'single_choice' | 'multi_choice' | 'scale' | 'open_ended' | 'yes_no';
export type QuestionMode = 'foundation' | 'probing' | 'discovery' | 'transformation' | 'validation' | 'benchmark';

export interface GeneratedQuestion {
    id: string;
    question: string;
    type: QuestionType;
    options?: string[];
    mode: QuestionMode;
    areaId: AreaId;
    followUpTopics?: string[];
}

export interface QuestionAnswer {
    questionId: string;
    question: string;
    answer: string | string[] | number | boolean;
    type: QuestionType;
    mode: QuestionMode;
    timestamp: Date;
    source?: 'user' | 'auto_fill';
    confidence?: number;
}

export interface AreaProgress {
    areaId: AreaId;
    name: string;
    questionsAnswered: number;
    status: 'not_started' | 'in_progress' | 'completed';
    insights: string[];
}

export interface ReadinessSession {
    sessionId: string;
    userId: string;
    domainId?: string;
    language: LanguageCode;
    createdAt: Date;
    updatedAt: Date;
    status: 'draft' | 'in_progress' | 'completed';
    selectedAreas: AreaId[];
    currentArea: AreaId | null;
    responses: {
        [areaId: string]: QuestionAnswer[];
    };
    documents: {
        documentId: string;
        areaId: AreaId;
        filename: string;
        uploadedAt: Date;
    }[];
    conversationContext: {
        identifiedGaps: string[];
        transformationOpportunities: string[];
        painPoints: string[];
    };
}

const READINESS_INDEX = 'readiness_sessions';

// Create new readiness session
export async function createReadinessSession(userId: string, language: LanguageCode = 'en'): Promise<ReadinessSession> {
    const validLanguage = isValidLanguage(language) ? language : 'en';

    const session: ReadinessSession = {
        sessionId: uuidv4(),
        userId,
        domainId: getActiveDomainId(),
        language: validLanguage,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'draft',
        selectedAreas: [],
        currentArea: null,
        responses: {},
        documents: [],
        conversationContext: {
            identifiedGaps: [],
            transformationOpportunities: [],
            painPoints: [],
        },
    };

    await opensearchClient.index({
        index: READINESS_INDEX,
        id: session.sessionId,
        body: session,
        refresh: true,
    });

    return session;
}

// Get readiness session
export async function getReadinessSession(sessionId: string): Promise<ReadinessSession | null> {
    try {
        const result = await opensearchClient.get({
            index: READINESS_INDEX,
            id: sessionId,
        });
        return result.body._source as ReadinessSession;
    } catch (error: any) {
        if (error.meta?.statusCode === 404) return null;
        throw error;
    }
}

// Update session
export async function updateReadinessSession(session: ReadinessSession): Promise<void> {
    session.updatedAt = new Date();
    await opensearchClient.index({
        index: READINESS_INDEX,
        id: session.sessionId,
        body: session,
        refresh: true,
    });
}

// Set selected areas
export async function setSelectedAreas(sessionId: string, areas: AreaId[]): Promise<ReadinessSession> {
    const session = await getReadinessSession(sessionId);
    if (!session) throw new Error('Session not found');

    // Validate areas against the active domain
    const domainAreas = getDomainAreas();
    const validAreaIds = new Set(domainAreas.map(a => a.id));
    const validAreas = areas.filter(a => validAreaIds.has(a));
    if (validAreas.length === 0) throw new Error('No valid areas selected');

    session.selectedAreas = validAreas;
    session.status = 'in_progress';
    session.currentArea = validAreas[0];

    for (const areaId of validAreas) {
        if (!session.responses[areaId]) {
            session.responses[areaId] = [];
        }
    }

    await updateReadinessSession(session);
    return session;
}

// Save answer
export async function saveAnswer(
    sessionId: string,
    areaId: AreaId,
    answer: QuestionAnswer
): Promise<ReadinessSession> {
    const session = await getReadinessSession(sessionId);
    if (!session) throw new Error('Session not found');

    if (!session.responses[areaId]) {
        session.responses[areaId] = [];
    }

    session.responses[areaId].push({
        ...answer,
        timestamp: new Date(),
    });

    await updateReadinessSession(session);
    return session;
}

// Get progress
export function getProgress(session: ReadinessSession): AreaProgress[] {
    return session.selectedAreas.map(areaId => {
        const area = getDomainArea(areaId);
        const answers = session.responses[areaId] || [];
        const questionsAnswered = answers.length;

        let status: AreaProgress['status'] = 'not_started';
        if (questionsAnswered > 0 && questionsAnswered < 5) {
            status = 'in_progress';
        } else if (questionsAnswered >= 5) {
            status = 'completed';
        }

        return {
            areaId,
            name: area?.name ?? areaId,
            questionsAnswered,
            status,
            insights: [],
        };
    });
}

// Switch to area
export async function switchToArea(sessionId: string, areaId: AreaId): Promise<ReadinessSession> {
    const session = await getReadinessSession(sessionId);
    if (!session) throw new Error('Session not found');

    if (!session.selectedAreas.includes(areaId)) {
        throw new Error('Area not selected for this session');
    }

    session.currentArea = areaId;
    await updateReadinessSession(session);
    return session;
}

// Get all areas (from active domain)
export function getAllAreas() {
    return getDomainAreas();
}

// Add document to session
export async function addDocumentToSession(
    sessionId: string,
    documentId: string,
    areaId: AreaId,
    filename: string
): Promise<void> {
    const session = await getReadinessSession(sessionId);
    if (!session) throw new Error('Session not found');

    session.documents.push({
        documentId,
        areaId,
        filename,
        uploadedAt: new Date(),
    });

    await updateReadinessSession(session);
}

// Update conversation context
export async function updateContext(
    sessionId: string,
    context: Partial<ReadinessSession['conversationContext']>
): Promise<void> {
    const session = await getReadinessSession(sessionId);
    if (!session) throw new Error('Session not found');

    if (context.identifiedGaps) {
        session.conversationContext.identifiedGaps.push(...context.identifiedGaps);
    }
    if (context.transformationOpportunities) {
        session.conversationContext.transformationOpportunities.push(...context.transformationOpportunities);
    }
    if (context.painPoints) {
        session.conversationContext.painPoints.push(...context.painPoints);
    }

    await updateReadinessSession(session);
}
