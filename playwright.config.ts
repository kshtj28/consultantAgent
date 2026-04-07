import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const bddTestDir = defineBddConfig({
    features: './e2e/features/**/*.feature',
    steps: ['./e2e/steps/**/*.ts', './e2e/fixtures/test.ts'],
});

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    retries: 1,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
    use: {
        baseURL: 'http://localhost:3001',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'bdd',
            testDir: bddTestDir,
            use: { ...devices['Desktop Chrome'] },
            timeout: 600_000,
        },
    ],
});
