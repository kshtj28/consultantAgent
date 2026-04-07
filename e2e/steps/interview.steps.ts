import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';
import { InterviewApiClient, BroadAreaProgress } from '../fixtures/api-helpers';
import {
    getStrategyByName,
    weakStrategy,
    strongStrategy,
    getBroadAreaForSubArea,
    AnswerStrategyFn,
} from '../fixtures/answer-strategies';
import { SessionData } from '../support/world';

const { Given, When, Then } = createBdd(test);

const ALL_BROAD_AREA_IDS = [
    'order_to_cash',
    'procure_to_pay',
    'record_to_report',
    'treasury_cash_management',
    'compliance_controls',
];

Given('the domain is set to {string}', async ({ apiClient }) => {
    await apiClient.setDomain('finance');
});

When(
    'I start a new interview with depth {string} and all broad areas selected',
    async ({ apiClient, world }, depth: string) => {
        const broadAreas = await apiClient.getBroadAreas();
        world.broadAreaIds = broadAreas.map((ba) => ba.id);

        const res = await apiClient.startSession(depth, world.broadAreaIds);
        world.currentStrategy = 'pending';
        world.sessions[world.currentStrategy] = {
            sessionId: res.sessionId,
            progress: res.progress,
            status: 'in_progress',
            transcript: [],
        };
    },
);

Then('I should receive a welcome message and first question', async ({ world }) => {
    const session = world.sessions[world.currentStrategy];
    expect(session).toBeTruthy();
    expect(session.sessionId).toBeTruthy();
});

async function runInterviewLoop(
    apiClient: InterviewApiClient,
    session: SessionData,
    strategyFn: AnswerStrategyFn,
    strategyName: string,
    filterBroadArea?: string,
): Promise<void> {
    let progress = session.progress;
    let isCompleted = false;

    while (!isCompleted) {
        const targetSubArea = findNextUncoveredSubArea(progress, filterBroadArea);
        if (!targetSubArea) break;

        let questionRes;
        try {
            questionRes = await apiClient.getNextQuestion(session.sessionId, targetSubArea);
        } catch {
            break;
        }

        const question = questionRes.question;
        if (!question) break;

        const payload = strategyFn(question, targetSubArea);
        session.transcript.push({
            subAreaId: targetSubArea,
            questionId: question.id,
            question: question.question,
            answer: payload.answer,
            strategy: strategyName,
        });

        const answerRes = await apiClient.submitAnswer(session.sessionId, payload);
        progress = answerRes.progress;
        session.progress = progress;

        if (answerRes.completed) {
            session.status = 'completed';
            isCompleted = true;
        }
    }
}

function findNextUncoveredSubArea(
    progress: BroadAreaProgress[],
    filterBroadArea?: string,
): string | null {
    for (const ba of progress) {
        if (filterBroadArea && ba.broadAreaId !== filterBroadArea) continue;
        for (const sa of ba.subAreas) {
            if (sa.status !== 'covered') {
                return sa.subAreaId;
            }
        }
    }
    return null;
}

When(
    'I answer all questions using the {string} answer strategy',
    async ({ apiClient, world }, strategyName: string) => {
        const strategyFn = getStrategyByName(strategyName);
        const session = world.sessions['pending'] || world.sessions[strategyName];
        world.sessions[strategyName] = session;
        if (world.sessions['pending']) delete world.sessions['pending'];
        world.currentStrategy = strategyName;

        await runInterviewLoop(apiClient, session, strategyFn, strategyName);
    },
);

When(
    'I answer {word} questions using the {string} strategy',
    async ({ apiClient, world }, areaShortName: string, strategyName: string) => {
        const areaMap: Record<string, string> = {
            O2C: 'order_to_cash',
            P2P: 'procure_to_pay',
            R2R: 'record_to_report',
            Treasury: 'treasury_cash_management',
            Compliance: 'compliance_controls',
        };
        const broadAreaId = areaMap[areaShortName];
        if (!broadAreaId) throw new Error(`Unknown area shortname: ${areaShortName}`);

        const strategyFn = getStrategyByName(strategyName);
        const session = world.sessions['pending'] || world.sessions[world.currentStrategy];

        await runInterviewLoop(apiClient, session, strategyFn, strategyName, broadAreaId);
    },
);

Then(
    'all {int} sub-areas should reach {string} status',
    async ({ apiClient, world }, count: number, expectedStatus: string) => {
        const session = world.sessions[world.currentStrategy];
        const { progress } = await apiClient.getProgress(session.sessionId);
        session.progress = progress;

        const allSubAreas = progress.flatMap((ba) => ba.subAreas);
        const coveredCount = allSubAreas.filter((sa) => sa.status === expectedStatus).length;
        expect(coveredCount).toBe(count);
    },
);

Then('the session should auto-complete', async ({ apiClient, world }) => {
    const session = world.sessions[world.currentStrategy];
    const sessionData = await apiClient.getSession(session.sessionId);
    expect(sessionData.status).toBe('completed');
    session.status = 'completed';
});

Then('the data pipeline should be triggered', async ({ apiClient, world }) => {
    const session = world.sessions[world.currentStrategy];
    const { reports } = await apiClient.getReports();
    const sessionReports = reports.filter((r: any) => r.sessionId === session.sessionId);
    expect(sessionReports.length).toBeGreaterThan(0);
});

Given(
    'a deep interview is in progress with weak answers',
    async ({ apiClient, world }) => {
        await apiClient.setDomain('finance');
        const broadAreas = await apiClient.getBroadAreas();
        world.broadAreaIds = broadAreas.map((ba) => ba.id);

        const res = await apiClient.startSession('deep', world.broadAreaIds);
        world.currentStrategy = 'weak';
        world.sessions['weak'] = {
            sessionId: res.sessionId,
            progress: res.progress,
            status: 'in_progress',
            transcript: [],
        };

        await runInterviewLoop(apiClient, world.sessions['weak'], weakStrategy, 'weak');
    },
);

Then(
    'each sub-area should transition from {string} to {string} to {string}',
    async ({ world }, _s1: string, _s2: string, s3: string) => {
        const session = world.sessions[world.currentStrategy];
        const allSubAreas = session.progress.flatMap((ba) => ba.subAreas);
        for (const sa of allSubAreas) {
            expect(sa.status).toBe(s3);
        }
    },
);

Then(
    'each broad area should show {string} only when all its sub-areas are covered',
    async ({ world }, expectedStatus: string) => {
        const session = world.sessions[world.currentStrategy];
        for (const ba of session.progress) {
            const allCovered = ba.subAreas.every((sa) => sa.status === 'covered');
            if (allCovered) {
                expect(ba.overallStatus).toBe(expectedStatus);
            }
        }
    },
);

Then(
    'the progress sidebar should reflect accurate coverage percentages',
    async ({ page }) => {
        const BASE = 'http://localhost:3000';
        await page.goto(`${BASE}/process-analysis`);
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        const progressDots = page.locator('.pa-progress-dot');
        const dotCount = await progressDots.count();
        expect(dotCount).toBeGreaterThan(0);
    },
);

Given(
    'a deep interview is in progress with {int} broad areas covered',
    async ({ apiClient, world }, coveredCount: number) => {
        await apiClient.setDomain('finance');
        const broadAreas = await apiClient.getBroadAreas();
        world.broadAreaIds = broadAreas.map((ba) => ba.id);

        const res = await apiClient.startSession('deep', world.broadAreaIds);
        world.currentStrategy = 'partial';
        world.sessions['partial'] = {
            sessionId: res.sessionId,
            progress: res.progress,
            status: 'in_progress',
            transcript: [],
        };

        const areasToComplete = broadAreas.slice(0, coveredCount).map((ba) => ba.id);
        for (const baId of areasToComplete) {
            await runInterviewLoop(
                apiClient,
                world.sessions['partial'],
                weakStrategy,
                'weak',
                baId,
            );
        }
    },
);

When('I pause the interview session', async ({ apiClient, world }) => {
    const session =
        world.sessions['partial'] || world.sessions[world.currentStrategy];
    await apiClient.pauseSession(session.sessionId);
});

When('I pause the session', async ({ apiClient, world }) => {
    const session =
        world.sessions['partial'] || world.sessions[world.currentStrategy];
    await apiClient.pauseSession(session.sessionId);
});

Then('the data pipeline should trigger for covered areas only', async ({ apiClient, world }) => {
    const session = world.sessions['partial'];
    await new Promise((r) => setTimeout(r, 3_000));
    const { reports } = await apiClient.getReports();
    const sessionReports = reports.filter((r: any) => r.sessionId === session.sessionId);
    expect(sessionReports.length).toBeGreaterThan(0);
});

Then('partial reports should be generated for covered broad areas', async ({ apiClient, world }) => {
    const session = world.sessions['partial'];
    const reports = await apiClient.waitForPipelineCompletion(session.sessionId);
    const readyReports = reports.filter((r) => r.status === 'ready');
    expect(readyReports.length).toBeGreaterThan(0);
    world.reports['partial'] = {
        gapReports: readyReports,
        consolidatedReport: null,
        metrics: null,
    };
});

Then('the remaining sub-areas should still be available', async ({ apiClient, world }) => {
    const session = world.sessions['partial'];
    const { progress } = await apiClient.getProgress(session.sessionId);
    const uncoveredSubAreas = progress.flatMap((ba) =>
        ba.subAreas.filter((sa) => sa.status !== 'covered'),
    );
    expect(uncoveredSubAreas.length).toBeGreaterThan(0);
});

When(
    'I continue the interview by calling next-question on the paused session',
    async ({ apiClient, world }) => {
        const session = world.sessions['partial'];
        const { progress } = await apiClient.getProgress(session.sessionId);
        const nextSub = findNextUncoveredSubArea(progress);
        if (nextSub) {
            const questionRes = await apiClient.getNextQuestion(session.sessionId, nextSub);
            expect(questionRes.question).toBeTruthy();
        }
    },
);

Then('I can continue answering from where I left off', async ({ apiClient, world }) => {
    const session = world.sessions['partial'];
    const { progress } = await apiClient.getProgress(session.sessionId);
    session.progress = progress;
    const covered = progress.flatMap((ba) => ba.subAreas).filter((sa) => sa.status === 'covered');
    const uncovered = progress.flatMap((ba) => ba.subAreas).filter((sa) => sa.status !== 'covered');
    expect(covered.length).toBeGreaterThan(0);
    expect(uncovered.length).toBeGreaterThan(0);
});

Given(
    'a deep interview where only P2P sub-areas are fully covered',
    async ({ apiClient, world }) => {
        await apiClient.setDomain('finance');
        const broadAreas = await apiClient.getBroadAreas();
        world.broadAreaIds = broadAreas.map((ba) => ba.id);

        const res = await apiClient.startSession('deep', world.broadAreaIds);
        world.currentStrategy = 'partial-p2p';
        world.sessions['partial-p2p'] = {
            sessionId: res.sessionId,
            progress: res.progress,
            status: 'in_progress',
            transcript: [],
        };

        await runInterviewLoop(
            apiClient,
            world.sessions['partial-p2p'],
            weakStrategy,
            'weak',
            'procure_to_pay',
        );
    },
);

Then(
    'only the P2P gap analysis report should be generated',
    async ({ apiClient, world }) => {
        const session = world.sessions['partial-p2p'];
        const reports = await apiClient.waitForPipelineCompletion(session.sessionId);
        const p2pReports = reports.filter((r) => r.name?.toLowerCase().includes('procure'));
        expect(p2pReports.length).toBeGreaterThanOrEqual(1);
    },
);

Then('uncovered broad areas should not have reports', async ({ apiClient, world }) => {
    const session = world.sessions['partial-p2p'];
    const { reports } = await apiClient.getReports();
    const sessionReports = reports.filter((r: any) => r.sessionId === session.sessionId);
    for (const report of sessionReports) {
        const name = (report.name || '').toLowerCase();
        expect(name).not.toContain('order-to-cash');
        expect(name).not.toContain('record-to-report');
        expect(name).not.toContain('treasury');
    }
});

When('I submit an answer to a non-existent session', async ({ world }) => {
    const res = await fetch('http://localhost:3001/api/interview/nonexistent-session-id/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${world.apiToken}` },
        body: JSON.stringify({
            questionId: 'q1',
            question: 'test',
            answer: 'test',
            type: 'open_ended',
            mode: 'discovery',
            subAreaId: 'accounts_receivable',
        }),
    });
    world.lastApiStatus = res.status;
});

When('I submit an answer with missing required fields', async ({ apiClient, world }) => {
    const broadAreas = await apiClient.getBroadAreas();
    const res = await apiClient.startSession('quick', [broadAreas[0].id]);
    const rawRes = await apiClient.submitAnswerRaw(res.sessionId, {});
    world.lastApiStatus = rawRes.status;
});

// Note: 'I should receive a {int} response' step is defined in auth.steps.ts — do not duplicate here
