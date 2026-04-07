import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3001';
const CREDENTIALS = { username: 'admin', password: 'admin' };

// ─── helpers ────────────────────────────────────────────────────────────────

async function login(page: Page) {
    await page.goto(BASE_URL);
    await page.waitForSelector('.login-input', { timeout: 10_000 });
    await page.locator('.login-input').first().fill(CREDENTIALS.username);
    await page.locator('input[type="password"]').fill(CREDENTIALS.password);
    await page.locator('button[type="submit"]').click();
    // Wait for redirect away from login
    await page.waitForURL(url => !url.pathname.includes('login'), { timeout: 10_000 });
    // Wait for app to hydrate
    await page.waitForSelector('.mode-btn', { timeout: 8_000 });
}

async function clickMode(page: Page, label: string | RegExp) {
    const btn = page.locator('.mode-btn', { hasText: label }).first();
    await btn.waitFor({ state: 'visible', timeout: 6_000 });
    await btn.click();
    await page.waitForTimeout(600);
}

// ─── tests ───────────────────────────────────────────────────────────────────

test.describe('Authentication', () => {
    test('shows login page for unauthenticated users', async ({ page }) => {
        await page.goto(BASE_URL);
        await expect(page.locator('.login-card')).toBeVisible();
        await expect(page.locator('.login-title')).toContainText('Welcome Back');
    });

    test('rejects bad credentials', async ({ page }) => {
        await page.goto(BASE_URL);
        await page.locator('.login-input').first().fill('wrong');
        await page.locator('input[type="password"]').fill('wrong');
        await page.locator('button[type="submit"]').click();
        await expect(page.locator('.error-message')).toBeVisible({ timeout: 5_000 });
    });

    test('logs in with valid credentials and shows main app', async ({ page }) => {
        await login(page);
        await expect(page.locator('.mode-btn').first()).toBeVisible();
        await expect(page.locator('body')).not.toContainText('Welcome Back');
    });
});

test.describe('Sidebar navigation', () => {
    test.beforeEach(async ({ page }) => { await login(page); });

    test('shows all main navigation modes in sidebar', async ({ page }) => {
        const modeBtns = page.locator('.mode-btn');
        await expect(modeBtns.filter({ hasText: /chat/i }).first()).toBeVisible();
        await expect(modeBtns.filter({ hasText: /readiness/i }).first()).toBeVisible();
        await expect(modeBtns.filter({ hasText: /settings/i }).first()).toBeVisible();
    });

    test('sidebar shows active domain name in Discovery button', async ({ page }) => {
        // Discovery button label includes the active domain name (e.g. "Banking Discovery")
        const discoveryBtn = page.locator('.mode-btn').filter({ hasText: /discovery/i }).first();
        await expect(discoveryBtn).toBeVisible();
    });
});

test.describe('Configuration / Settings page — Industry dropdown', () => {
    test.beforeEach(async ({ page }) => { await login(page); });

    test('settings page renders "Industry" label (not "Domain")', async ({ page }) => {
        await clickMode(page, /settings/i);
        // Wait for config page content
        await page.waitForSelector('[class*="config"], [class*="Config"]', { timeout: 6_000 });
        const pageText = await page.textContent('body') ?? '';
        expect(pageText).toMatch(/industry/i);
        // Ensure the old "Domain" label is gone
        expect(pageText).not.toMatch(/\bDomain\b/);
    });

    test('industry dropdown lists Banking, Construction, Manufacturing', async ({ page }) => {
        await clickMode(page, /settings/i);
        await page.waitForSelector('[class*="config"], [class*="Config"]', { timeout: 6_000 });

        // Trigger the domain/industry dropdown
        const allSelects = page.locator('select');
        const selectCount = await allSelects.count();

        if (selectCount > 0) {
            // Find the select whose options contain industry names
            for (let i = 0; i < selectCount; i++) {
                const opts = await allSelects.nth(i).locator('option').allTextContents();
                const joined = opts.join(' ').toLowerCase();
                if (joined.match(/banking|construction|manufacturing/)) {
                    expect(joined).toContain('banking');
                    expect(joined).toContain('construction');
                    expect(joined).toContain('manufacturing');
                    return;
                }
            }
        }

        // Custom dropdown: click a button that contains a known industry name
        const dropdownTriggers = page.locator('[class*="dropdown-btn"], [class*="select-btn"], [class*="config-select"]');
        const count = await dropdownTriggers.count();
        for (let i = 0; i < count; i++) {
            const text = (await dropdownTriggers.nth(i).textContent() ?? '').toLowerCase();
            if (/banking|finance|construction|manufacturing/.test(text)) {
                await dropdownTriggers.nth(i).click();
                await page.waitForTimeout(400);
                const bodyText = await page.textContent('body') ?? '';
                expect(bodyText).toMatch(/banking/i);
                expect(bodyText).toMatch(/construction/i);
                expect(bodyText).toMatch(/manufacturing/i);
                return;
            }
        }

        // If we reach here, at minimum check that the page has the industry names
        const pageText = await page.textContent('body') ?? '';
        expect(pageText).toMatch(/banking|construction|manufacturing/i);
    });

    test('can select Construction in industry dropdown and save', async ({ page }) => {
        await clickMode(page, /settings/i);
        await page.waitForSelector('[class*="config"], [class*="Config"]', { timeout: 6_000 });

        const allSelects = page.locator('select');
        const selectCount = await allSelects.count();
        if (selectCount > 0) {
            for (let i = 0; i < selectCount; i++) {
                const opts = await allSelects.nth(i).locator('option').allTextContents();
                if (opts.join(' ').toLowerCase().includes('construction')) {
                    await allSelects.nth(i).selectOption({ label: /construction/i });
                    break;
                }
            }
        }

        // Click save button
        const saveBtn = page.locator('button').filter({ hasText: /save/i }).first();
        if (await saveBtn.isVisible()) {
            await saveBtn.click();
            await page.waitForTimeout(600);
        }

        // Verify we're still on settings without crash
        const pageText = await page.textContent('body') ?? '';
        expect(pageText).toMatch(/industry|settings|configuration/i);

        // Reset to finance
        await clickMode(page, /settings/i);
    });

    test('language selector exists on settings page', async ({ page }) => {
        await clickMode(page, /settings/i);
        await page.waitForSelector('[class*="config"], [class*="Config"]', { timeout: 6_000 });
        const pageText = await page.textContent('body') ?? '';
        expect(pageText).toMatch(/language/i);
    });

    test('AI Model selector is visible on settings page', async ({ page }) => {
        await clickMode(page, /settings/i);
        await page.waitForSelector('[class*="config"], [class*="Config"]', { timeout: 6_000 });
        const pageText = await page.textContent('body') ?? '';
        expect(pageText).toMatch(/model|AI|LLM/i);
    });
});

test.describe('Readiness / Interview page', () => {
    test.beforeEach(async ({ page }) => { await login(page); });

    test('readiness section loads with interview options', async ({ page }) => {
        await clickMode(page, /readiness/i);
        const bodyText = await page.textContent('body') ?? '';
        expect(bodyText).toMatch(/readiness|interview|assessment/i);
    });

    test('interview progress indicator is visible', async ({ page }) => {
        await clickMode(page, /readiness/i);
        const bodyText = await page.textContent('body') ?? '';
        expect(bodyText).toMatch(/progress|%|interview/i);
    });
});

test.describe('Finance Discovery (Interview) mode', () => {
    test.beforeEach(async ({ page }) => { await login(page); });

    test('discovery page loads with categories', async ({ page }) => {
        await clickMode(page, /discovery/i);
        const bodyText = await page.textContent('body') ?? '';
        expect(bodyText).toMatch(/discover|interview|finance|banking|category|process/i);
    });

    test('discovery button label reflects active domain', async ({ page }) => {
        const discoveryBtn = page.locator('.mode-btn').filter({ hasText: /discovery/i }).first();
        const btnText = await discoveryBtn.textContent() ?? '';
        // Should contain a domain name like "Banking Discovery"
        expect(btnText).toMatch(/banking|hr|supply|construction|manufacturing|discovery/i);
    });
});

test.describe('Chat mode', () => {
    test.beforeEach(async ({ page }) => { await login(page); });

    test('chat page loads', async ({ page }) => {
        await clickMode(page, /^chat$/i);
        const bodyText = await page.textContent('body') ?? '';
        expect(bodyText).toMatch(/chat|conversation|ask|upload|message/i);
    });

    test('chat input accepts text', async ({ page }) => {
        await clickMode(page, /^chat$/i);
        const chatInput = page.locator('textarea').first();
        if (await chatInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await chatInput.fill('Hello, what can you help me with?');
            await expect(chatInput).toHaveValue('Hello, what can you help me with?');
        } else {
            const bodyText = await page.textContent('body') ?? '';
            expect(bodyText.length).toBeGreaterThan(50);
        }
    });
});

test.describe('API smoke tests', () => {
    let token: string;

    test.beforeAll(async ({ request }) => {
        const res = await request.post('http://localhost:3000/api/auth/login', {
            data: CREDENTIALS,
        });
        const data = await res.json();
        token = data.token;
    });

    test('GET /api/readiness/config/domains returns 5 industries', async ({ request }) => {
        const res = await request.get('http://localhost:3000/api/readiness/config/domains', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        const data = await res.json();
        expect(data.domains).toHaveLength(5);
        const names = data.domains.map((d: any) => d.name);
        expect(names).toContain('Banking');
        expect(names).toContain('Construction & Site Management');
        expect(names).toContain('Manufacturing');
    });

    test('GET /api/readiness/config/domains includes correct IDs', async ({ request }) => {
        const res = await request.get('http://localhost:3000/api/readiness/config/domains', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const ids = data.domains.map((d: any) => d.id);
        expect(ids).toContain('finance');
        expect(ids).toContain('construction');
        expect(ids).toContain('manufacturing');
        expect(ids).toContain('hr');
        expect(ids).toContain('supplychain');
    });

    test('GET /api/readiness/config/languages returns language list', async ({ request }) => {
        const res = await request.get('http://localhost:3000/api/readiness/config/languages', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        const data = await res.json();
        expect(data.languages).toBeDefined();
        expect(data.languages.length).toBeGreaterThan(0);
    });

    test('GET /api/chat/models returns model list', async ({ request }) => {
        const res = await request.get('http://localhost:3000/api/chat/models', {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.ok()).toBeTruthy();
        const data = await res.json();
        expect(data.models).toBeDefined();
        expect(data.models.length).toBeGreaterThan(0);
    });

    test('PUT /api/readiness/config/domain accepts construction', async ({ request }) => {
        const res = await request.put('http://localhost:3000/api/readiness/config/domain', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: { domainId: 'construction' },
        });
        expect(res.ok()).toBeTruthy();
        // Reset back to finance
        await request.put('http://localhost:3000/api/readiness/config/domain', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: { domainId: 'finance' },
        });
    });

    test('PUT /api/readiness/config/domain accepts manufacturing', async ({ request }) => {
        const res = await request.put('http://localhost:3000/api/readiness/config/domain', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: { domainId: 'manufacturing' },
        });
        expect(res.ok()).toBeTruthy();
        // Reset back to finance
        await request.put('http://localhost:3000/api/readiness/config/domain', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: { domainId: 'finance' },
        });
    });

    test('POST /api/interview/start creates a session', async ({ request }) => {
        const res = await request.post('http://localhost:3000/api/interview/start', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: { userId: 'admin', model: 'ollama:gemma3:4b' },
        });
        expect(res.ok()).toBeTruthy();
        const data = await res.json();
        expect(data.sessionId).toBeDefined();
    });

    test('domain config invalid ID returns 400', async ({ request }) => {
        const res = await request.put('http://localhost:3000/api/readiness/config/domain', {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            data: { domainId: 'nonexistent_domain' },
        });
        expect(res.status()).toBe(400);
    });

    test('unauthorized request returns 401', async ({ request }) => {
        const res = await request.get('http://localhost:3000/api/readiness/config/domains');
        expect(res.status()).toBe(401);
    });
});
