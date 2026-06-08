import { expect } from '@playwright/test';
import { test } from '../../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../../pages/search.page';

async function mockWindowOpen(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
        window.open = (url?: string | URL) => {
            const openedUrls = ((window as typeof window & { openedUrls?: string[] }).openedUrls ??=
                []);
            openedUrls.push(String(url));
            return null;
        };
    });
}

async function getOpenedUrls(page: import('@playwright/test').Page) {
    return page.evaluate(
        () => (window as typeof window & { openedUrls?: string[] }).openedUrls ?? [],
    );
}

test.describe('Search linkout data use terms modal', () => {
    test('can be opened, closed, and launched with both data-use options', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();
        await mockWindowOpen(page);
        page.on('dialog', async (dialog) => {
            expect(dialog.message()).toContain('This tool is recommended for at most');
            await dialog.accept();
        });

        await page.getByRole('button', { name: 'Tools' }).click();
        await page.getByRole('menuitem', { name: 'Nextclade' }).click();

        await expect(page.getByRole('heading', { name: 'Options for launching' })).toBeVisible();

        await page.getByRole('button', { name: 'Close' }).click();
        await expect(page.getByRole('heading', { name: 'Options for launching' })).toBeHidden();
        expect(await getOpenedUrls(page)).toEqual([]);

        await page.getByRole('button', { name: 'Tools' }).click();
        await page.getByRole('menuitem', { name: 'Nextclade' }).click();
        await page.getByRole('button', { name: 'Open sequences only' }).click();

        let openedUrls = await getOpenedUrls(page);
        expect(openedUrls).toHaveLength(1);
        expect(openedUrls[0]).toContain('dataUseTerms%3DOPEN');

        await page.getByRole('button', { name: 'Tools' }).click();
        await page.getByRole('menuitem', { name: 'Nextclade' }).click();
        await page.getByRole('button', { name: 'Include Restricted-Use' }).click();

        openedUrls = await getOpenedUrls(page);
        expect(openedUrls).toHaveLength(2);
        expect(openedUrls[1]).not.toContain('dataUseTerms%3DOPEN');
    });
});
