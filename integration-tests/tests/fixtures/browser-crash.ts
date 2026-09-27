import fs from 'fs';
import path from 'path';
import type { Page, TestInfo } from '@playwright/test';

// Retries are only for attempts that lost their browser (Firefox's parent process occasionally dies in CI).
const markerPath = (testInfo: TestInfo) =>
    path.join(testInfo.project.outputDir, '.browser-crashes', testInfo.testId);

export function recordBrowserCrashes(page: Page, testInfo: TestInfo) {
    const record = () => {
        fs.mkdirSync(path.dirname(markerPath(testInfo)), { recursive: true });
        fs.writeFileSync(markerPath(testInfo), '');
    };
    const browser = page.context().browser();
    browser?.on('disconnected', record);
    page.on('crash', record);
    return () => {
        browser?.off('disconnected', record);
        page.off('crash', record);
    };
}

export function assertRetryFollowsBrowserCrash(testInfo: TestInfo) {
    if (testInfo.retry > 0 && !fs.existsSync(markerPath(testInfo))) {
        throw new Error(
            'Not retrying: retries are reserved for browser crashes, and the previous attempt failed for another reason (see its error above).',
        );
    }
}
