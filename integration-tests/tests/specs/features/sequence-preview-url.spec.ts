import { expect, test } from '@playwright/test';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence Preview URL Parameters', () => {

    let searchPage: SearchPage;

    test.beforeEach(async ({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should store the previewed sequence ID in the URL', async ({ page }) => {
        await searchPage.ebolaSudan();

        let urlParams = await searchPage.getUrlParams();
        expect(urlParams.has('selectedSeq')).toBe(false);

        await searchPage.clickOnSequence(0);

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();

        urlParams = await searchPage.getUrlParams();
        expect(urlParams.has('selectedSeq')).toBe(true);
        expect(urlParams.get('selectedSeq')).not.toBeNull();
        const selectedSeqId = urlParams.get('selectedSeq');

        await (await searchPage.closePreviewButton()).click();

        urlParams = await searchPage.getUrlParams();
        expect(urlParams.has('selectedSeq')).toBe(false);

        const currentUrl = new URL(page.url());
        currentUrl.searchParams.set('selectedSeq', selectedSeqId);
        await page.goto(currentUrl.toString());

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    });

    test('should store half-screen state in the URL', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.clickOnSequence(0);

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();

        await (await searchPage.toggleHalfScreenButton()).click();

        let urlParams = await searchPage.getUrlParams();
        expect(urlParams.has('halfScreen')).toBe(true);
        expect(urlParams.get('halfScreen')).toBe('true');

        await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();

        await (await searchPage.toggleHalfScreenButton()).click();

        urlParams = await searchPage.getUrlParams();
        expect(urlParams.has('halfScreen')).toBe(false);

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    });

    test('should restore state from URL parameters on page load', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.clickOnSequence(0);
        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();

        const urlParams = await searchPage.getUrlParams();
        const selectedSeqId = urlParams.get('selectedSeq');

        await (await searchPage.toggleHalfScreenButton()).click();

        await (await searchPage.closePreviewButton()).click();

        const currentUrl = new URL(page.url());
        currentUrl.searchParams.set('selectedSeq', selectedSeqId);
        currentUrl.searchParams.set('halfScreen', 'true');
        await page.goto(currentUrl.toString());

        await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();

        await page.goto('/');
        await page.goBack();

        await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();
    });
});
