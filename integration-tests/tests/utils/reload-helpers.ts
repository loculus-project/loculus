import { type Page } from '@playwright/test';

// Chromium rejects a reload that arrives while a navigation's frame swap is still settling.
const transientReloadErrors = [
    'Not attached to an active page',
    'Execution context was destroyed',
    'Navigating frame was detached',
];

/**
 * Reloads the page, tolerating the protocol errors that a reload issued moments after a navigation
 * can hit while the browser settles.
 *
 * Only for use inside a retry loop, where one lost reload should cost an interval rather than the
 * test. `expect.poll` propagates a throw from its callback instead of retrying it, so an unguarded
 * reload aborts the whole wait after a few milliseconds. Anything other than the known transients is
 * rethrown, so a page that is genuinely gone still fails with its own cause.
 */
export async function reloadForRetry(page: Page): Promise<void> {
    try {
        await page.reload();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!transientReloadErrors.some((transient) => message.includes(transient))) {
            throw error;
        }
        // Log it: the loop hides the failure otherwise, and a burst of these is worth noticing.
        console.warn(`Retrying after a transient reload error: ${message.split('\n')[0]}`);
    }
}
