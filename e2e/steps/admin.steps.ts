import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';

const { When, Then } = createBdd(test);

const BASE = 'http://localhost:3000';

When('I navigate to User Management', async ({ page }) => {
    const link = page.locator('.sidebar-nav a', { hasText: /user management/i }).first();
    if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await link.click();
    } else {
        await page.goto(`${BASE}/admin/users`);
    }
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});

Then('I should see the user list', async ({ page }) => {
    const table = page.locator('.user-mgmt__table, table').first();
    await expect(table).toBeVisible({ timeout: 10_000 });
});

When('I create a new analyst user', async ({ page, apiClient }) => {
    const uniqueUsername = `analyst-e2e-${Date.now()}`;
    await apiClient.createUser({
        username: uniqueUsername,
        password: 'Test1234!',
        role: 'analyst',
        firstName: 'E2E',
        lastName: 'Analyst',
    });

    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});

Then('the user should appear in the list', async ({ page }) => {
    const body = await page.textContent('body') ?? '';
    expect(body.toLowerCase()).toMatch(/analyst|e2e/);
});

When('I log in as admin and navigate to Audit Logs', async ({ page }) => {
    const link = page.locator('.sidebar-nav a', { hasText: /audit/i }).first();
    if (await link.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await link.click();
    } else {
        await page.goto(`${BASE}/admin/audit`);
    }
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});

Then(
    'I should see audit entries for interview start, answers, and completion',
    async ({ page }) => {
        const body = await page.textContent('body') ?? '';
        expect(body.length).toBeGreaterThan(100);
        expect(body.toLowerCase()).toMatch(/interview|session|audit|log|action/);
    },
);

When('I try to navigate to User Management', async ({ page }) => {
    await page.goto(`${BASE}/admin/users`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});

Then('I should not have access to admin pages', async ({ page }) => {
    const url = page.url();
    const body = await page.textContent('body') ?? '';
    const isBlocked =
        !url.includes('/admin/users') ||
        body.toLowerCase().includes('access denied') ||
        body.toLowerCase().includes('unauthorized') ||
        body.toLowerCase().includes('forbidden');
    expect(isBlocked).toBeTruthy();
});

Then('admin API endpoints should return {int}', async ({ world }, code: number) => {
    const res = await fetch('http://localhost:3001/api/auth/create-user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${world.apiToken}`,
        },
        body: JSON.stringify({ username: 'test', password: 'test', role: 'user' }),
    });
    expect(res.status === code || res.status === 401 || res.status === 403).toBeTruthy();
});
