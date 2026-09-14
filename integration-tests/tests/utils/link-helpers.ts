import { Locator, expect } from '@playwright/test';
import { FileContent } from './file-upload-helpers';

/**
 * Fetches content from a link's href attribute and asserts it matches expected content
 */
export async function getFromLinkTargetAndAssertContent(
    linkLocator: Locator,
    expectedContent: FileContent,
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
    if (Buffer.isBuffer(expectedContent)) {
        // Gzipped uploads are served back byte for byte; a diff of the bytes would be
        // unreadable (and huge), so just report the sizes on mismatch.
        const body = await response.body();
        expect(
            body.equals(expectedContent),
            `content served from ${url} (${body.byteLength} bytes) differs from the expected ${expectedContent.byteLength} bytes`,
        ).toBe(true);
        return;
    }
    const content = await response.text();
    expect(content).toBe(expectedContent);
}
