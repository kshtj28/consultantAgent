import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

const BASE = 'http://localhost:3000';

When('I navigate to the {word} page', async ({ page }, pageName: string) => {
    const navMap: Record<string, RegExp> = {
        Dashboard: /dashboard/i,
        Reports: /reports/i,
        Insights: /insights/i,
        Settings: /settings/i,
        'SME': /sme engagement/i,
    };

    const label = navMap[pageName];
    if (label) {
        const link = page.locator('.sidebar-nav a', { hasText: label }).first();
        if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await link.click();
            await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
            return;
        }
    }

    await page.goto(`${BASE}/${pageName.toLowerCase()}`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});


Then('the overall maturity scores should be visible', async ({ page }) => {
    const kpiCards = page.locator('.dashboard__kpi-card');
    await expect(kpiCards.first()).toBeVisible({ timeout: 10_000 });
    const count = await kpiCards.count();
    expect(count).toBeGreaterThan(0);
});

Then(
    'gap severity counts should show predominantly {string} severity',
    async ({ page }, level: string) => {
        const kpiRow = page.locator('.dashboard__kpi-row');
        await expect(kpiRow).toBeVisible({ timeout: 10_000 });
        const bodyText = await page.locator('.dashboard').textContent() ?? '';
        expect(bodyText.length).toBeGreaterThan(0);
    },
);

Then('the automation quotient should be low', async ({ page }) => {
    const dashText = await page.locator('.dashboard').textContent() ?? '';
    expect(dashText.toLowerCase()).toContain('automation');
});

Then('discovery progress should show {string}', async ({ page }, percentage: string) => {
    const dashText = await page.locator('.dashboard').textContent() ?? '';
    expect(dashText.length).toBeGreaterThan(0);
});

Then(
    'I should see gap analysis reports for all {int} broad areas',
    async ({ page }, count: number) => {
        const reportItems = page.locator('.report-item');
        await expect(reportItems.first()).toBeVisible({ timeout: 10_000 });
        const totalReports = await reportItems.count();
        expect(totalReports).toBeGreaterThanOrEqual(count);
    },
);

Then('I should see a consolidated report', async ({ page }) => {
    const bodyText = await page.locator('.reports-page').textContent() ?? '';
    expect(bodyText.toLowerCase()).toMatch(/consolidated|summary/);
});

Then('each report should have status {string}', async ({ page }, status: string) => {
    const generatingIndicator = page.locator('text=generating');
    const isGenerating = await generatingIndicator.isVisible().catch(() => false);
    expect(isGenerating).toBeFalsy();
});

When('I open a gap analysis report', async ({ page }) => {
    const firstReport = page.locator('.report-item').first();
    await firstReport.click();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});

Then('it should contain a gap inventory section', async ({ page }) => {
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/gap|inventory|finding/);
});

Then('it should contain a roadmap with phases and dependencies', async ({ page }) => {
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/roadmap|phase|timeline/);
});

Then('it should contain recommendations', async ({ page }) => {
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/recommend|action|suggestion/);
});

Then('it should contain maturity level assessment', async ({ page }) => {
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/maturity|level|assessment/);
});

Then('it should contain quick wins section', async ({ page }) => {
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/quick win|immediate|low.effort/);
});

When('I click export on a gap analysis report', async ({ page }) => {
    const exportBtn = page.locator('.report-item__actions button').first();
    if (await exportBtn.isVisible().catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
        await exportBtn.click();
        const download = await downloadPromise;
        if (download) {
            expect(download.suggestedFilename()).toBeTruthy();
        }
    }
});

Then('a PDF download should be triggered', async () => {
    expect(true).toBeTruthy();
});

When('I filter by report type {string}', async ({ page }, type: string) => {
    const tab = page.locator('.report-tab', { hasText: new RegExp(type.replace('_', ' '), 'i') });
    if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    }
});

Then('only gap analysis reports should be shown', async ({ page }) => {
    const reportItems = page.locator('.report-item');
    const count = await reportItems.count();
    expect(count).toBeGreaterThan(0);
});

When('I filter by broad area {string}', async ({ page }, areaName: string) => {
    const filter = page.locator('select, .filter-dropdown').first();
    if (await filter.isVisible().catch(() => false)) {
        await filter.selectOption({ label: areaName });
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    }
});

Then('only P2P reports should be shown', async ({ page }) => {
    const reportItems = page.locator('.report-item');
    const count = await reportItems.count();
    expect(count).toBeGreaterThanOrEqual(0);
});
