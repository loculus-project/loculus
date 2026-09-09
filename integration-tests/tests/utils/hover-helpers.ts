import { expect, Locator, Page } from '@playwright/test';

/**
 * Hovers `target` until `revealed` is visible, retrying the hover.
 *
 * A page is server-rendered before react hydrates, and a hover that arrives before the handlers
 * are attached is lost for good: the mouse is already on the element, so no further mouseover
 * fires once they are. Clicks do not need this because `Button`/`DisabledUntilHydrated` keep
 * controls disabled until hydration, which playwright waits for - a hover has nothing to wait on.
 */
export async function hoverUntilVisible(
    page: Page,
    target: Locator,
    revealed: Locator,
    { timeout = 30_000, hoverTimeout = 2000 }: { timeout?: number; hoverTimeout?: number } = {},
) {
    await expect(async () => {
        // move away first, so the next hover really does dispatch a mouseover
        await page.mouse.move(0, 0);
        await target.hover();
        await expect(revealed).toBeVisible({ timeout: hoverTimeout });
    }).toPass({ timeout });
}
