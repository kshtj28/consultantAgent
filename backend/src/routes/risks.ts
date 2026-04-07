import { Router, Request, Response } from 'express';
import { opensearchClient, INDICES } from '../config/database';

const router = Router();

interface SmeContact {
    name: string;
    role: string;
}

interface RiskItem {
    id: string;
    severity: 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK';
    title: string;
    source: string;          // which area or session it came from
    smeContact: SmeContact;
    annualImpact: string;
    sessionId: string;
    timestamp: string;
}

interface EngagementEntry {
    label: string;
    percent: number;
    color: 'green' | 'amber' | 'red';
}

const FALLBACK_SME: SmeContact = { name: 'Unknown', role: 'Analyst' };

/**
 * Compute an annual-impact estimate from real session metrics.
 *
 * Formula:
 *   baseImpact     = (gapCount * 150_000) + (painPointCount * 75_000)
 *   impactMultiplier = 1 + (questionsAnswered / 20)
 *   impact          = baseImpact * impactMultiplier
 *
 * Display: values >= 1M -> "$X.XM", otherwise -> "$XXXK"
 */
function formatAnnualImpact(gapCount: number, painPointCount: number, questionsAnswered: number): string {
    const baseImpact = (gapCount * 150_000) + (painPointCount * 75_000);
    const impactMultiplier = 1 + (questionsAnswered / 20);
    const impact = baseImpact * impactMultiplier;

    if (impact >= 1_000_000) {
        return `$${(impact / 1_000_000).toFixed(1)}M`;
    }
    if (impact >= 1_000) {
        return `$${Math.round(impact / 1_000)}K`;
    }
    return '$0';
}

/**
 * Count total questions answered across all areas in a session.
 */
function countQuestionsAnswered(responses: Record<string, any[]> | undefined): number {
    if (!responses || Array.isArray(responses)) return 0;
    let total = 0;
    for (const areaId of Object.keys(responses)) {
        const areaAnswers = responses[areaId];
        if (Array.isArray(areaAnswers)) {
            total += areaAnswers.length;
        }
    }
    return total;
}

/**
 * Batch-fetch users from `consultant_users` by a set of userIds.
 * Returns a Map<userId, { name: string; role: string }>.
 */
async function fetchUserMap(userIds: Set<string>): Promise<Map<string, SmeContact>> {
    const userMap = new Map<string, SmeContact>();
    if (userIds.size === 0) return userMap;

    try {
        const usersExist = await opensearchClient.indices.exists({ index: INDICES.USERS });
        if (!usersExist.body) return userMap;

        const result = await opensearchClient.search({
            index: INDICES.USERS,
            body: {
                query: {
                    terms: {
                        userId: Array.from(userIds),
                    },
                },
                size: userIds.size,
                _source: ['userId', 'firstName', 'lastName', 'department', 'role'],
            },
        });

        for (const hit of (result.body.hits.hits || []) as any[]) {
            const user = hit._source;
            if (!user || !user.userId) continue;

            const firstName = user.firstName || '';
            const lastName = user.lastName || '';
            const name = `${firstName} ${lastName}`.trim() || 'Unknown';
            const role = user.department || user.role || 'Analyst';

            userMap.set(user.userId, { name, role });
        }
    } catch (err: any) {
        console.warn('Error fetching users for risk SME contacts:', err.message);
    }

    return userMap;
}

// GET /api/risks/summary
router.get('/summary', async (_req: Request, res: Response) => {
    const risks: RiskItem[] = [];
    const engagementMap: Record<string, { answered: number; total: number }> = {};

    try {
        const sessExists = await opensearchClient.indices.exists({ index: 'readiness_sessions' });
        if (!sessExists.body) {
            return res.json({ risks: [], engagement: [], totalRisks: 0, overallEngagement: 0 });
        }

        const result = await opensearchClient.search({
            index: 'readiness_sessions',
            body: {
                query: { match_all: {} },
                size: 50,
            },
        });

        const hits = (result.body.hits.hits || []) as any[];

        // ---- Pass 1: Collect unique userIds from sessions that have gaps or painPoints ----
        const userIdSet = new Set<string>();
        for (const hit of hits) {
            const doc = hit._source;
            if (!doc) continue;

            const context = doc.conversationContext || doc.context || {};
            const gaps: string[] = context.identifiedGaps || [];
            const painPoints: string[] = context.painPoints || [];

            if ((gaps.length > 0 || painPoints.length > 0) && doc.userId) {
                userIdSet.add(doc.userId);
            }
        }

        // ---- Batch-fetch user data ----
        const userMap = await fetchUserMap(userIdSet);

        // ---- Pass 2: Build risks and engagement ----
        let riskCounter = 0;
        for (const hit of hits) {
            const doc = hit._source;
            if (!doc) continue;

            const context = doc.conversationContext || doc.context || {};
            const sessionId = doc.sessionId || hit._id;
            const updatedAt = doc.updatedAt || doc.createdAt || new Date().toISOString();
            const source = doc.currentArea || 'General';
            const userId: string | undefined = doc.userId;

            // Resolve SME contact from real user data
            const smeContact: SmeContact = (userId && userMap.has(userId))
                ? userMap.get(userId)!
                : FALLBACK_SME;

            // Session-level metrics for impact calculation
            const gaps: string[] = context.identifiedGaps || [];
            const painPoints: string[] = context.painPoints || [];
            const responses: Record<string, any[]> = doc.responses && !Array.isArray(doc.responses) ? doc.responses : {};
            const questionsAnswered = countQuestionsAnswered(responses);
            const gapCount = gaps.length;
            const painPointCount = painPoints.length;

            // Compute annual impact from real session metrics
            const annualImpact = formatAnnualImpact(gapCount, painPointCount, questionsAnswered);

            // Extract identifiedGaps as risks
            for (const gap of gaps) {
                riskCounter++;
                const severity: RiskItem['severity'] = riskCounter <= 2 ? 'HIGH RISK' : riskCounter <= 5 ? 'MEDIUM RISK' : 'LOW RISK';
                risks.push({
                    id: `risk-${riskCounter}`,
                    severity,
                    title: gap,
                    source,
                    smeContact,
                    annualImpact,
                    sessionId,
                    timestamp: updatedAt,
                });
            }

            // Extract painPoints as risks
            for (const pp of painPoints) {
                riskCounter++;
                const severity: RiskItem['severity'] = riskCounter <= 3 ? 'HIGH RISK' : 'MEDIUM RISK';
                risks.push({
                    id: `risk-${riskCounter}`,
                    severity,
                    title: pp,
                    source,
                    smeContact,
                    annualImpact,
                    sessionId,
                    timestamp: updatedAt,
                });
            }

            // Build engagement data from responses per area
            const selectedAreas: string[] = doc.selectedAreas || [];
            for (const areaId of selectedAreas) {
                if (!engagementMap[areaId]) {
                    engagementMap[areaId] = { answered: 0, total: 5 }; // default 5 questions per area
                }
                const areaAnswers = responses[areaId];
                if (Array.isArray(areaAnswers)) {
                    engagementMap[areaId].answered += areaAnswers.length;
                }
            }
        }
    } catch (err: any) {
        console.warn('Error fetching risk data:', err.message);
    }

    // Build engagement entries
    const engagement: EngagementEntry[] = Object.entries(engagementMap).map(([label, data]) => {
        const percent = Math.min(100, Math.round((data.answered / Math.max(data.total, 1)) * 100));
        return {
            label,
            percent,
            color: percent >= 70 ? 'green' : percent >= 40 ? 'amber' : 'red',
        };
    });

    const overallEngagement = engagement.length > 0
        ? Math.round(engagement.reduce((sum, e) => sum + e.percent, 0) / engagement.length)
        : 0;

    // Sort risks: HIGH first, then MEDIUM, then LOW
    const severityOrder = { 'HIGH RISK': 0, 'MEDIUM RISK': 1, 'LOW RISK': 2 };
    risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    res.json({
        risks: risks.slice(0, 10),  // Top 10
        engagement,
        totalRisks: risks.length,
        overallEngagement,
    });
});

export default router;
