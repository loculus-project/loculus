import { defineConfig, devices } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */

export default defineConfig({
    testDir: './tests',
    // This option allows parallel execution of tests in a single file.
    // It is disabled by default because it can cause issues with some tests.
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 1,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html', { open: 'never' }]],
    use: {
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    globalSetup: './tests/playwrightSetup.ts',
    timeout: 1 * 60 * 1000, // Extend further if we get timeouts in CI

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        ...(process.env.ALL_BROWSERS === 'true'
            ? [
                  {
                      name: 'firefox',
                      use: { ...devices['Desktop Firefox'] },
                  },
                  {
                      name: 'webkit',
                      use: { ...devices['Desktop Safari'] },
                  },
              ]
            : []),
    ],
});
