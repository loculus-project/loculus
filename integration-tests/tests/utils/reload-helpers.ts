import { type Locator, type Page, expect } from '@playwright/test';

// A reload or a read landing mid-navigation is rejected with one of these.
const transientNavigationErrors = [
    'Not attached to an active page',
    'Execution context was destroyed',
    'Navigating frame was detached',
];

const defaultTimeout = 90_000;
const reloadIntervals = [2000, 5000];

type ReloadPollOptions = { message?: string; timeout?: number };

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : JSON.stringify(error);
}

/**
 * Reloads the page and reads a value from it until a matcher chained onto the result passes:
 * `await reloadAndPoll(page, read).toBeGreaterThanOrEqual(3)`. The search pages do not update
 * themselves, so waiting for released sequences to show up means reloading.
 */
export function reloadAndPoll<T>(
    page: Page,
    read: () => Promise<T>,
    { message, timeout = defaultTimeout }: ReloadPollOptions = {},
) {
    let firstAttempt = true;
    return expect.poll(
        async (): Promise<T | undefined> => {
            try {
                // No point reloading a page that already shows what we are waiting for.
                if (firstAttempt) {
                    firstAttempt = false;
                } else {
                    await page.reload();
                }
                return await read();
            } catch (error) {
                const message = errorMessage(error);
                // `expect.poll` propagates a throw instead of retrying it, so tolerate these here.
                if (!transientNavigationErrors.some((transient) => message.includes(transient))) {
                    throw error;
                }
                console.warn(`Retrying after a transient error: ${message.split('\n')[0]}`);
                return undefined;
            }
        },
        { message, timeout, intervals: reloadIntervals },
    );
}

/** Like `reloadAndPoll`, but returns the value that satisfied `isDone`. */
export async function reloadUntil<T>(
    page: Page,
    read: () => Promise<T>,
    isDone: (value: T) => boolean,
    options: ReloadPollOptions = {},
): Promise<T> {
    let lastRead: T | undefined;
    await reloadAndPoll(
        page,
        async () => {
            lastRead = await read();
            return isDone(lastRead);
        },
        options,
    ).toBe(true);
    return lastRead;
}

export async function reloadUntilVisible(
    page: Page,
    locator: Locator,
    options: ReloadPollOptions = {},
): Promise<void> {
    await reloadUntil(
        page,
        () => locator.isVisible(),
        (visible) => visible,
        // `toBe(true)` failing names nothing, so let the locator describe itself.
        { message: `Expected ${String(locator)} to become visible.`, ...options },
    );
}
