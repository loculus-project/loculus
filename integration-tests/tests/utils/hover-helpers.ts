import { expect, type Locator, type Page } from '@playwright/test';

// A hover that lands before the element's island has hydrated is lost for good, because the
// pointer is already inside it when the listener is attached; moving away and back re-delivers it.
export async function hoverUntilVisible(
    page: Page,
    anchor: Locator,
    target: Locator,
    timeout = 30_000,
) {
    await expect(async () => {
        await page.mouse.move(0, 0);
        await anchor.hover();
        await expect(target).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout });
}
