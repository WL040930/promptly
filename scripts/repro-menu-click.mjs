import assert from 'node:assert/strict';
import { chromium } from '/Users/wl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

let browser;
try {
    console.error('STEP launch');
    browser = await chromium.launch({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        timeout: 10_000,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.on('console', message => console.error(`PAGE ${message.type()}: ${message.text()}`));
    page.on('pageerror', error => console.error(`PAGE ERROR: ${error.message}`));
    await page.addInitScript(() => {
        localStorage.setItem('auth_token', 'debug-token');
        localStorage.setItem('auth_user', JSON.stringify({
            id: 'debug-user',
            email: 'debug@promptly.local',
            onboardingCompletedAt: new Date().toISOString(),
        }));
    });
    await page.route('**/api/auth/me', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: {
            id: 'debug-user',
            email: 'debug@promptly.local',
            onboardingCompletedAt: new Date().toISOString(),
        } }),
    }));
    await page.route('**/api/**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
    }));

    console.error('STEP navigate');
    await page.goto('http://localhost:5173/app/home', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    const menuItem = page.getByRole('button', { name: 'Automations' });
    console.error('STEP wait-menu');
    await menuItem.waitFor();
    console.error('STEP click-menu');
    await menuItem.click();

    assert.equal(new URL(page.url()).pathname, '/app/automations',
        `menu click did not navigate; URL remained ${page.url()}`);
    console.log('PASS: clicking Automations navigated to /app/automations');
} catch (error) {
    console.error(`FAIL: ${error.stack || error}`);
    process.exitCode = 1;
} finally {
    console.error('STEP close');
    await browser?.close().catch(error => console.error(`CLOSE ERROR: ${error.message}`));
}
