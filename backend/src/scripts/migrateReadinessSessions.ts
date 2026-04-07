import { opensearchClient, INDICES } from '../config/database';
import { getBroadAreaForSubArea } from '../services/domainService';

interface LegacyReadinessSession {
    sessionId: string;
    userId: string;
    domainId?: string;
    language: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    selectedAreas: string[];
    currentArea: string | null;
    responses: Record<string, any[]>;
    documents?: any[];
    conversationContext?: {
        identifiedGaps: string[];
        transformationOpportunities: string[];
        painPoints: string[];
    };
}

async function migrateReadinessSessions() {
    console.log('Starting readiness → interview migration...');

    let hits: any[] = [];
    try {
        const result = await opensearchClient.search({
            index: 'readiness_sessions',
            body: { query: { match_all: {} }, size: 10000 },
        });
        hits = result.body.hits.hits;
    } catch (err: any) {
        if (err.meta?.statusCode === 404) {
            console.log('No readiness_sessions index found. Nothing to migrate.');
            return;
        }
        throw err;
    }

    console.log(`Found ${hits.length} readiness sessions to migrate.`);

    for (const hit of hits) {
        const old: LegacyReadinessSession = hit._source;

        const broadAreaIds = new Set<string>();
        for (const areaId of old.selectedAreas || []) {
            const ba = getBroadAreaForSubArea(areaId);
            if (ba) broadAreaIds.add(ba.id);
        }

        const coverage: Record<string, any> = {};
        for (const [areaId, answers] of Object.entries(old.responses || {})) {
            const count = Array.isArray(answers) ? answers.length : 0;
            coverage[areaId] = {
                questionsAnswered: count,
                aiConfident: count >= 5,
                status: count === 0 ? 'not_started' : count >= 5 ? 'covered' : 'in_progress',
            };
        }

        const migrated = {
            sessionType: 'interview_session',
            sessionId: old.sessionId,
            userId: old.userId,
            domainId: old.domainId,
            language: old.language || 'en',
            createdAt: old.createdAt,
            updatedAt: old.updatedAt,
            status: old.status,
            selectedBroadAreas: Array.from(broadAreaIds),
            currentSubArea: old.currentArea,
            depth: 'standard',
            responses: old.responses || {},
            coverage,
            conversationHistory: [],
            conversationContext: old.conversationContext || {
                identifiedGaps: [],
                transformationOpportunities: [],
                painPoints: [],
            },
            migratedFrom: 'readiness',
        };

        await opensearchClient.index({
            index: INDICES.CONVERSATIONS,
            id: `interview_${old.sessionId}`,
            body: migrated,
            refresh: 'wait_for',
        });

        console.log(`Migrated session ${old.sessionId} → interview_${old.sessionId}`);
    }

    console.log(`Migration complete. ${hits.length} sessions migrated.`);
}

migrateReadinessSessions()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
