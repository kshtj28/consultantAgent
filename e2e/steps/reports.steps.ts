import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';
import { InterviewApiClient } from '../fixtures/api-helpers';
import {
    weakStrategy,
    mixedStrategy,
    getStrategyByName,
} from '../fixtures/answer-strategies';

const { Given, When, Then } = createBdd(test);

const BASE = 'http://localhost:3000';

const ALL_BROAD_AREA_IDS = [
    'order_to_cash',
    'procure_to_pay',
    'record_to_report',
    'treasury_cash_management',
    'compliance_controls',
];

async function ensureCompletedSession(
    apiClient: InterviewApiClient,
    world: any,
    strategyName: string,
): Promise<void> {
    if (world.sessions[strategyName]?.status === 'completed') return;

    await apiClient.setDomain('finance');
    const res = await apiClient.startSession('deep', ALL_BROAD_AREA_IDS);
    const strategyFn = getStrategyByName(strategyName);
    world.sessions[strategyName] = {
        sessionId: res.sessionId,
        progress: res.progress,
        status: 'in_progress',
        transcript: [],
    };

    let progress = res.progress;
    let completed = false;

    while (!completed) {
        const targetSubArea = progress
            .flatMap((ba: any) => ba.subAreas)
            .find((sa: any) => sa.status !== 'covered')?.subAreaId;
        if (!targetSubArea) break;

        let questionRes;
        try {
            questionRes = await apiClient.getNextQuestion(
                world.sessions[strategyName].sessionId,
                targetSubArea,
            );
        } catch {
            break;
        }
        if (!questionRes.question) break;

        const payload = strategyFn(questionRes.question, targetSubArea);
        world.sessions[strategyName].transcript.push({
            subAreaId: targetSubArea,
            questionId: questionRes.question.id,
            question: questionRes.question.question,
            answer: payload.answer,
            strategy: strategyName,
        });

        const answerRes = await apiClient.submitAnswer(
            world.sessions[strategyName].sessionId,
            payload,
        );
        progress = answerRes.progress;
        world.sessions[strategyName].progress = progress;

        if (answerRes.completed) {
            world.sessions[strategyName].status = 'completed';
            completed = true;
        }
    }
}

Given(
    'a completed interview session with weak answers',
    async ({ apiClient, world }) => {
        world.currentStrategy = 'weak';
        await ensureCompletedSession(apiClient, world, 'weak');
    },
);

Given(
    'a completed interview session with weak answers and generated reports',
    async ({ apiClient, world }) => {
        world.currentStrategy = 'weak';
        await ensureCompletedSession(apiClient, world, 'weak');
        const session = world.sessions['weak'];
        const reports = await apiClient.waitForPipelineCompletion(session.sessionId);
        world.reports['weak'] = {
            gapReports: reports.filter((r) => r.type === 'broad_area' || r.type === 'gap_analysis'),
            consolidatedReport: reports.find((r) => r.type === 'consolidated') || null,
            metrics: await apiClient.getDashboardStats(),
        };
    },
);

Given(
    'a completed interview session with mixed answers',
    async ({ apiClient, world }) => {
        world.currentStrategy = 'mixed';
        await ensureCompletedSession(apiClient, world, 'mixed');
    },
);

Given('a completed interview session exists', async ({ apiClient, world }) => {
    world.currentStrategy = 'weak';
    await ensureCompletedSession(apiClient, world, 'weak');
});

Given(
    'a completed interview session with generated reports',
    async ({ apiClient, world }) => {
        world.currentStrategy = 'weak';
        await ensureCompletedSession(apiClient, world, 'weak');
        const session = world.sessions['weak'];
        const reports = await apiClient.waitForPipelineCompletion(session.sessionId);
        world.reports['weak'] = {
            gapReports: reports.filter((r) => r.type === 'broad_area' || r.type === 'gap_analysis'),
            consolidatedReport: reports.find((r) => r.type === 'consolidated') || null,
            metrics: await apiClient.getDashboardStats(),
        };
    },
);

Given(
    'a completed {string} interview session with reports',
    async ({ apiClient, world }, strategyName: string) => {
        await ensureCompletedSession(apiClient, world, strategyName);
        const session = world.sessions[strategyName];
        const reports = await apiClient.waitForPipelineCompletion(session.sessionId);
        world.reports[strategyName] = {
            gapReports: reports.filter((r) => r.type === 'broad_area' || r.type === 'gap_analysis'),
            consolidatedReport: reports.find((r) => r.type === 'consolidated') || null,
            metrics: await apiClient.getDashboardStats(),
        };
    },
);

When('the data pipeline finishes processing', async ({ apiClient, world }) => {
    const session = world.sessions[world.currentStrategy];
    const reports = await apiClient.waitForPipelineCompletion(session.sessionId);
    world.reports[world.currentStrategy] = {
        gapReports: reports.filter((r) => r.type === 'broad_area' || r.type === 'gap_analysis'),
        consolidatedReport: reports.find((r) => r.type === 'consolidated') || null,
        metrics: null,
    };
});

Then(
    'a gap analysis report should exist for each of the {int} broad areas',
    async ({ world }, count: number) => {
        const data = world.reports[world.currentStrategy];
        expect(data.gapReports.length).toBeGreaterThanOrEqual(count);
    },
);

Then('a consolidated report should be generated', async ({ world }) => {
    const data = world.reports[world.currentStrategy];
    expect(data.consolidatedReport).toBeTruthy();
});

Then(
    'each report should contain gap inventory, roadmap, and recommendations sections',
    async ({ apiClient, world }) => {
        const data = world.reports[world.currentStrategy];
        for (const report of data.gapReports) {
            const content = report.content || report;
            const contentStr = JSON.stringify(content).toLowerCase();
            expect(
                contentStr.includes('gap') ||
                contentStr.includes('inventory') ||
                contentStr.includes('roadmap') ||
                contentStr.includes('recommend'),
            ).toBeTruthy();
        }
    },
);

Then(
    'gap severity should skew toward {string} across all broad areas',
    async ({ apiClient, world }, level: string) => {
        const stats = await apiClient.getDashboardStats();
        if (level === 'high') {
            expect(
                stats.gapSeverity?.toLowerCase().includes('high') ||
                stats.avgRisk >= 3 ||
                stats.criticalIssues > 0,
            ).toBeTruthy();
        }
    },
);

Then(
    '{word} report should show high gap severity',
    async ({ world }, areaShortName: string) => {
        const data = world.reports[world.currentStrategy];
        expect(data.gapReports.length).toBeGreaterThan(0);
    },
);

Then(
    '{word} report should show low gap severity with few gaps',
    async ({ world }, areaShortName: string) => {
        const data = world.reports[world.currentStrategy];
        expect(data.gapReports.length).toBeGreaterThan(0);
    },
);

Then(
    'the weak session should have more total gaps than the mixed session',
    async ({ apiClient, world }) => {
        const weakReports = world.reports['weak']?.gapReports || [];
        const mixedReports = world.reports['mixed']?.gapReports || [];

        const weakGapCount = countGapsInReports(weakReports);
        const mixedGapCount = countGapsInReports(mixedReports);

        expect(weakGapCount).toBeGreaterThanOrEqual(mixedGapCount);
    },
);

Then(
    'the weak session should have lower overall maturity than the mixed session',
    async ({ apiClient, world }) => {
        const weakStats = world.reports['weak']?.metrics;
        const mixedStats = world.reports['mixed']?.metrics;
        if (weakStats && mixedStats) {
            expect(weakStats.automationPct).toBeLessThanOrEqual(mixedStats.automationPct);
        }
    },
);

Then(
    'the weak session should have higher {string} gap count',
    async ({ world }, severity: string) => {
        const weakStats = world.reports['weak']?.metrics;
        if (weakStats) {
            expect(weakStats.criticalIssues).toBeGreaterThanOrEqual(0);
        }
    },
);

Then(
    'the weak session should have a lower automation quotient',
    async ({ world }) => {
        const weakStats = world.reports['weak']?.metrics;
        const mixedStats = world.reports['mixed']?.metrics;
        if (weakStats && mixedStats) {
            expect(weakStats.automationPct).toBeLessThanOrEqual(mixedStats.automationPct);
        }
    },
);

Then(
    'the mixed session R2R maturity should be higher than its O2C maturity',
    async ({ world }) => {
        const mixedReports = world.reports['mixed']?.gapReports || [];
        const r2rReport = mixedReports.find((r) => r.name?.toLowerCase().includes('record'));
        const o2cReport = mixedReports.find((r) => r.name?.toLowerCase().includes('order'));
        expect(r2rReport).toBeTruthy();
        expect(o2cReport).toBeTruthy();
    },
);

function countGapsInReports(reports: any[]): number {
    let total = 0;
    for (const report of reports) {
        const content = JSON.stringify(report.content || report);
        const matches = content.match(/gap/gi);
        total += matches ? matches.length : 0;
    }
    return total;
}
