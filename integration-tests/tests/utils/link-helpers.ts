import { Locator, expect } from '@playwright/test';
import { gunzipSync } from 'zlib';
import { isGzipName } from './file-upload-helpers';

/**
 * Fetches content from a link's href attribute and asserts it matches expected content.
 * Buffers are compared byte for byte. For text, `fileName` decides whether to gunzip.
 */
export async function getFromLinkTargetAndAssertContent(
    linkLocator: Locator,
    expectedContent: string | Buffer,
    fileName: string,
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
    const body = await response.body();
    if (Buffer.isBuffer(expectedContent)) {
        expect(body).toEqual(expectedContent);
        return;
    }
    const content = isGzipName(fileName) ? gunzipSync(body).toString() : body.toString();
    expect(content).toBe(expectedContent);
}
