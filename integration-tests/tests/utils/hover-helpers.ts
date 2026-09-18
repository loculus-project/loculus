import { expect, type Locator } from '@playwright/test';

const defaultTimeout = 15_000;

type HoverOptions = { timeout?: number };

/**
 * Hovers `anchor` until `target` becomes visible. A hover that lands before the anchor's island
 * has hydrated is lost for good, because the pointer is already inside it when the listener is
 * attached; moving away and back re-delivers it.
 */
export async function hoverUntilVisible(
    anchor: Locator,
    target: Locator,
    { timeout = defaultTimeout }: HoverOptions = {},
) {
    const page = anchor.page();
    await expect(async () => {
        // Any coordinate outside the anchor will do; the bottom left corner is inert on our pages,
        // while the top left sits under the header.
        const viewport = page.viewportSize();
        await page.mouse.move(0, viewport ? viewport.height - 1 : 0);
        await anchor.hover();
        await expect(target).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout });
}
