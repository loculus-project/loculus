import { expect, type Page } from '@playwright/test';

/**
 * Takes a screenshot and compares it with the baseline.
 * Screenshots are only validated when CHECK_SNAPSHOTS=true is set.
 * Set this in CI or when you want to check/update screenshots locally.
 */
export function testScreenshot(page: Page, name: string) {
    if (process.env.CHECK_SNAPSHOTS === 'true') {
        return expect(page).toHaveScreenshot(name);
    }
    return Promise.resolve();
}
