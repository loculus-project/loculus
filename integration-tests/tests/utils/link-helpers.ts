import { Locator, expect } from '@playwright/test';

/**
 * Fetches content from a link's href attribute and asserts it matches expected content
 */
export async function getFromLinkTargetAndAssertContent(
    linkLocator: Locator,
    expectedContent: string,
) {
    await expect(linkLocator).toBeVisible();
    const page = linkLocator.page();
    const href = await linkLocator.getAttribute('href');
    if (!href) {
        throw new Error(`Link locator has no href attribute`);
    }
    const url = href.startsWith('http') ? href : new URL(href, page.url()).toString();
    const response = await page.request.get(url);
    expect(response.status()).toBe(200);
    const content = await response.text();
    expect(content).toBe(expectedContent);
}
