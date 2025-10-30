import { defineConfig, devices } from '@playwright/test';

const browser = process.env.BROWSER;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config = {
    testDir: './tests',
    /* Timeout for each test in milliseconds */
    timeout: 60_000,
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 0 : 0,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
        /* Ignore HTTPS errors when requested via environment variable. */
        ignoreHTTPSErrors: process.env.PLAYWRIGHT_TEST_IGNORE_HTTPS_ERRORS === 'true',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: (process.env.CI ? 'retain-on-failure' : 'on') as
            | 'on'
            | 'off'
            | 'retain-on-failure'
            | 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        // Dependent project setup
        {
            name: 'readonly setup',
            testMatch: /readonly\.setup\.ts/,
        },
        {
            name: 'chromium-with-dep',
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['readonly setup'],
            testMatch: /.*\.dependent\.spec\.ts/,
        },
        {
            name: 'firefox-with-dep',
            use: {
                ...devices['Desktop Firefox'],
            },
            dependencies: ['readonly setup'],
            testMatch: /.*\.dependent\.spec\.ts/,
        },

        {
            name: 'chromium-without-dep',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /^(?!.*\.dependent\.spec\.ts$).*\.spec\.ts$/,
        },
        {
            name: 'firefox-without-dep',
            use: { ...devices['Desktop Firefox'] },
            testMatch: /^(?!.*\.dependent\.spec\.ts$).*\.spec\.ts$/,
        },

        // CLI tests - still need browser for user setup
        {
            name: 'cli-tests',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /.*\/cli\/.*\.spec\.ts$/,
        },
    ],
};

if (browser) {
    config.projects = config.projects.filter(
        (p) => p.name.startsWith(browser) || p.name === 'readonly setup' || p.name === 'cli-tests',
    );
}

export default defineConfig(config);
