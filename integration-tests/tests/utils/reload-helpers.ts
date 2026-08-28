import { type Locator, type Page, expect } from '@playwright/test';

// Chromium rejects a reload that arrives while a navigation's frame swap is still settling.
const transientReloadErrors = [
    'Not attached to an active page',
    'Execution context was destroyed',
    'Navigating frame was detached',
];

const defaultTimeout = 90_000;
const reloadIntervals = [2000, 5000];

type ReloadPollOptions = { message: string; timeout?: number };

async function reloadForRetry(page: Page): Promise<void> {
    try {
        await page.reload();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!transientReloadErrors.some((transient) => message.includes(transient))) {
            throw error;
        }
        // The retry hides these otherwise, and a burst of them is worth noticing.
        console.warn(`Retrying after a transient reload error: ${message.split('\n')[0]}`);
    }
}

/**
 * Reloads the page and reads a value from it, until a matcher chained onto the result passes:
 * `await reloadAndPoll(page, read, { message }).toBe(true)`.
 *
 * The search pages do not update themselves, so waiting for released sequences to show up means
 * reloading. Reloads that land in the moments after a navigation can be rejected by the browser,
 * and `expect.poll` propagates a throw from its callback instead of retrying it, so the reload has
 * to tolerate those itself or one rejection ends the whole wait.
 */
export function reloadAndPoll<T>(
    page: Page,
    read: () => Promise<T>,
    { message, timeout = defaultTimeout }: ReloadPollOptions,
) {
    return expect.poll(
        async () => {
            await reloadForRetry(page);
            return read();
        },
        { message, timeout, intervals: reloadIntervals },
    );
}

/** Reloads the page until `locator` is visible. */
export async function reloadUntilVisible(
    page: Page,
    locator: Locator,
    options: ReloadPollOptions,
): Promise<void> {
    await reloadAndPoll(page, () => locator.isVisible(), options).toBe(true);
}
