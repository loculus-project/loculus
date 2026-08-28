import { type Locator, type Page, expect } from '@playwright/test';

// Thrown when a reload or a read lands while a navigation's frame swap is still settling.
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

function isTransient(error: unknown): boolean {
    const message = errorMessage(error);
    return transientNavigationErrors.some((transient) => message.includes(transient));
}

/**
 * Reloads the page and reads a value from it until a matcher chained onto the result passes:
 * `await reloadAndPoll(page, read).toBeGreaterThanOrEqual(3)`.
 *
 * The search pages do not update themselves, so waiting for released sequences to show up means
 * reloading. A reload or a read that lands in the moments after a navigation can be rejected by the
 * browser, and `expect.poll` propagates a throw from its callback instead of retrying it, so the
 * callback has to tolerate those itself or one rejection ends the whole wait. Anything else is
 * rethrown, so a page that is genuinely gone still fails with its own cause.
 */
export function reloadAndPoll<T>(
    page: Page,
    read: () => Promise<T>,
    { message, timeout = defaultTimeout }: ReloadPollOptions = {},
) {
    // The first attempt reads without reloading: the `while` loops this replaced checked before
    // reloading, and there is no point reloading a page that already shows what we are waiting for.
    let firstAttempt = true;
    return expect.poll(
        async (): Promise<T | undefined> => {
            try {
                if (firstAttempt) {
                    firstAttempt = false;
                } else {
                    await page.reload();
                }
                return await read();
            } catch (error) {
                if (!isTransient(error)) {
                    throw error;
                }
                // The retry hides these otherwise, and a burst of them is worth noticing.
                const [firstLine] = errorMessage(error).split('\n');
                console.warn(`Retrying after a transient error: ${firstLine}`);
                return undefined;
            }
        },
        { message, timeout, intervals: reloadIntervals },
    );
}

/** Reloads the page until `read` returns a value that satisfies `isDone`, and returns that value. */
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

/** Reloads the page until `locator` is visible. */
export async function reloadUntilVisible(
    page: Page,
    locator: Locator,
    options: ReloadPollOptions = {},
): Promise<void> {
    // A bare `expect(false).toBe(true)` names nothing, and the locator describes itself.
    await reloadUntil(
        page,
        () => locator.isVisible(),
        (visible) => visible,
        {
            message: `Expected ${String(locator)} to become visible.`,
            ...options,
        },
    );
}
