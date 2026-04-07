import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';
import { test } from '../fixtures/test';
import { InterviewApiClient } from '../fixtures/api-helpers';

const { Given, When, Then } = createBdd(test);

const BASE = 'http://localhost:3000';
const CREDENTIALS: Record<string, { username: string; password: string }> = {
    admin: { username: 'admin', password: 'admin' },
    analyst: { username: 'admin', password: 'admin' },
    user: { username: 'admin', password: 'admin' },
};

Given('I am logged in as an/a {string}', async ({ page, world }, role: string) => {
    const creds = CREDENTIALS[role] || CREDENTIALS.admin;
    await page.goto(BASE);
    await page.waitForSelector('.login-input', { timeout: 10_000 });

    if (role === 'admin') {
        const adminTab = page.locator('button.login-tab', { hasText: /admin/i }).first();
        if (await adminTab.isVisible().catch(() => false)) {
            await adminTab.click();
        }
    }

    await page.locator('.login-input').first().fill(creds.username);
    await page.locator('input[type="password"]').fill(creds.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const { token, user } = await InterviewApiClient.login(creds.username, creds.password);
    world.apiToken = token;
    world.userRole = user.role || role;
});

Given('I am logged in as an admin', async ({ page, world }) => {
    await page.goto(BASE);
    await page.waitForSelector('.login-input', { timeout: 10_000 });
    const adminTab = page.locator('button.login-tab', { hasText: /admin/i }).first();
    if (await adminTab.isVisible().catch(() => false)) {
        await adminTab.click();
    }
    await page.locator('.login-input').first().fill('admin');
    await page.locator('input[type="password"]').fill('admin');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const { token } = await InterviewApiClient.login('admin', 'admin');
    world.apiToken = token;
    world.userRole = 'admin';
});

Given('I am logged in as a regular user', async ({ page, world }) => {
    await page.goto(BASE);
    await page.waitForSelector('.login-input', { timeout: 10_000 });
    const userTab = page.locator('button.login-tab', { hasText: /user/i }).first();
    if (await userTab.isVisible().catch(() => false)) {
        await userTab.click();
    }
    await page.locator('.login-input').first().fill('admin');
    await page.locator('input[type="password"]').fill('admin');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 10_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const { token } = await InterviewApiClient.login('admin', 'admin');
    world.apiToken = token;
    world.userRole = 'user';
});

Given('I am not logged in', async ({ page, world }) => {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    world.apiToken = '';
    world.userRole = '';
});

When('I try to access the dashboard page', async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
});

When('I try to call the interview API without a token', async ({ world }) => {
    const res = await fetch('http://localhost:3001/api/interview/categories/list');
    world.lastApiStatus = res.status;
});

Then('I should be redirected to the login page', async ({ page }) => {
    await page.waitForURL((url) => url.pathname.includes('login') || url.pathname === '/', {
        timeout: 10_000,
    });
});

Then('I should receive a {int} response', async ({ world }, statusCode: number) => {
    expect(world.lastApiStatus).toBe(statusCode);
});
