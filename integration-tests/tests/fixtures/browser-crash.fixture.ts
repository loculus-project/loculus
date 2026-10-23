import fs from 'fs';
import path from 'path';
import { test as base, type TestInfo } from '@playwright/test';

// Each worker runs one test at a time, including fixture setup and teardown.
let activeTest: TestInfo | undefined;

const markerPath = (testInfo: TestInfo, retry = testInfo.retry) =>
    path.join(testInfo.project.outputDir, '.browser-crashes', `${testInfo.testId}-${retry}`);

function recordCrash() {
    if (activeTest) {
        const marker = markerPath(activeTest);
        fs.mkdirSync(path.dirname(marker), { recursive: true });
        fs.writeFileSync(marker, '');
    }
}

/** CI Firefox retries require a crash in the previous attempt. Other retries are unchanged. */
export const test = base.extend<{ browserCrashRetryGuard: void }>({
    browser: [
        async ({ browser }, use) => {
            browser.on('disconnected', recordCrash);
            try {
                await use(browser);
            } finally {
                // Remove before the base worker fixture closes the browser normally.
                browser.off('disconnected', recordCrash);
            }
        },
        { scope: 'worker' },
    ],
    browserCrashRetryGuard: [
        async ({ browserName }, use, testInfo) => {
            if (!process.env.CI || browserName !== 'firefox') {
                await use();
                return;
            }
            if (testInfo.retry > 0 && !fs.existsSync(markerPath(testInfo, testInfo.retry - 1))) {
                throw new Error(
                    'Not retrying: retries are reserved for browser crashes, and the previous attempt failed for another reason (see its error above).',
                );
            }
            activeTest = testInfo;
            try {
                await use();
            } finally {
                activeTest = undefined;
            }
        },
        { auto: true },
    ],
    page: async ({ page }, use) => {
        page.on('crash', recordCrash);
        try {
            await use(page);
        } finally {
            page.off('crash', recordCrash);
        }
    },
});
