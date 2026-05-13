import { defineConfig, devices } from '@playwright/test';

const browser = process.env.BROWSER;
const readonlySetupName = 'readonly-setup';

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
        /* Authelia is served over HTTPS via traefik using a self-signed cert in
         * dev/CI; production deployments use a real cert. Always accept. */
        ignoreHTTPSErrors: true,
        /* Map the *.loculus.test dev domain to localhost without needing an
         * /etc/hosts entry on the host. */
        launchOptions: {
            args: [
                '--host-resolver-rules=MAP *.loculus.test 127.0.0.1, MAP loculus.test 127.0.0.1',
            ],
        },

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
            name: readonlySetupName,
            use: { ...devices['Desktop Chrome'] },
            testMatch: /readonly\.setup\.ts/,
        },
        {
            name: 'chromium-with-dep',
            use: { ...devices['Desktop Chrome'] },
            dependencies: [readonlySetupName],
            testMatch: /.*\.dependent\.spec\.ts/,
        },
        {
            name: 'firefox-with-dep',
            use: {
                ...devices['Desktop Firefox'],
            },
            dependencies: [readonlySetupName],
            testMatch: /.*\.dependent\.spec\.ts/,
        },

        {
            name: 'chromium-without-dep',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /^(?!.*\.dependent\.spec\.ts$).*\.spec\.ts$/,
            testIgnore: /.*\/cli\/.*\.spec\.ts$/,
        },
        {
            name: 'firefox-without-dep',
            use: { ...devices['Desktop Firefox'] },
            testMatch: /^(?!.*\.dependent\.spec\.ts$).*\.spec\.ts$/,
            testIgnore: /.*\/cli\/.*\.spec\.ts$/,
        },

        // CLI tests - still need browser for user setup
        {
            name: 'cli-tests',
            use: { ...devices['Desktop Chrome'] },
            testMatch: /.*\/cli\/.*\.spec\.ts$/,
        },
    ],
};

const testSuite = process.env.TEST_SUITE || 'all';

if (testSuite === 'cli') {
    // Run only CLI tests
    config.projects = config.projects.filter((p) => p.name === 'cli-tests');
} else if (browser) {
    if (testSuite === 'browser') {
        // Run only browser tests (exclude CLI)
        config.projects = config.projects.filter(
            (p) => p.name.startsWith(browser) || p.name === readonlySetupName,
        );
    } else {
        // Default 'all': run both browser and CLI tests
        config.projects = config.projects.filter(
            (p) =>
                p.name.startsWith(browser) ||
                p.name === readonlySetupName ||
                p.name === 'cli-tests',
        );
    }
}

export default defineConfig(config);
