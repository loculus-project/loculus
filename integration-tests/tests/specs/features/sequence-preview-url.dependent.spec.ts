import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence Preview URL Parameters', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should store the previewed sequence ID in the URL', async ({ page }) => {
        await searchPage.ebolaSudan();

        let urlParams = searchPage.getUrlParams();
        expect(urlParams.has('selectedSeq')).toBe(false);

        await searchPage.clickOnSequence(0);

        await expect(searchPage.getSequencePreviewModal()).toBeVisible();

        urlParams = searchPage.getUrlParams();
        expect(urlParams.has('selectedSeq')).toBe(true);
        expect(urlParams.get('selectedSeq')).not.toBeNull();
        const selectedSeqId = urlParams.get('selectedSeq');

        await searchPage.closePreviewButton().click();

        urlParams = searchPage.getUrlParams();
        expect(urlParams.has('selectedSeq')).toBe(false);

        const currentUrl = new URL(page.url());
        currentUrl.searchParams.set('selectedSeq', selectedSeqId);
        await page.goto(currentUrl.toString());

        await expect(searchPage.getSequencePreviewModal()).toBeVisible();
    });

    test('should store half-screen state in the URL', async () => {
        await searchPage.ebolaSudan();

        await searchPage.clickOnSequence(0);

        await expect(searchPage.getSequencePreviewModal()).toBeVisible();

        await searchPage.toggleHalfScreenButton().click();

        let urlParams = searchPage.getUrlParams();
        expect(urlParams.has('halfScreen')).toBe(true);
        expect(urlParams.get('halfScreen')).toBe('true');

        await expect(searchPage.getHalfScreenPreview()).toBeVisible();

        await searchPage.toggleHalfScreenButton().click();

        urlParams = searchPage.getUrlParams();
        expect(urlParams.has('halfScreen')).toBe(false);

        await expect(searchPage.getSequencePreviewModal()).toBeVisible();
    });

    test('should restore state from URL parameters on page load', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.clickOnSequence(0);
        await expect(searchPage.getSequencePreviewModal()).toBeVisible();

        const urlParams = searchPage.getUrlParams();
        const selectedSeqId = urlParams.get('selectedSeq');

        await searchPage.toggleHalfScreenButton().click();

        await searchPage.closePreviewButton().click();

        const currentUrl = new URL(page.url());
        currentUrl.searchParams.set('selectedSeq', selectedSeqId);
        currentUrl.searchParams.set('halfScreen', 'true');
        await page.goto(currentUrl.toString());

        await expect(searchPage.getHalfScreenPreview()).toBeVisible();

        await page.goto('/');
        await page.goBack();

        await expect(searchPage.getHalfScreenPreview()).toBeVisible();
    });
});
