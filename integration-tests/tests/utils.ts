import { Page, expect } from '@playwright/test';

export async function checkFileContent(page: Page, fileName: string, fileContent: string) {
    await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible();
    // check response instead of page content, because the file might also trigger a download in some cases.
    const fileUrl = await page.getByRole('link', { name: fileName }).getAttribute('href');
    await Promise.all([
        page.waitForResponse(
            async (resp) => resp.status() === 200 && (await resp.text()) === fileContent,
        ),
        page.evaluate((url) => fetch(url), fileUrl),
    ]);
}
