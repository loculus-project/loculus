import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence Preview URL Parameters', () => {
    let searchPage: SearchPage;

    test.beforeEach(({ page }) => {
        searchPage = new SearchPage(page);
    });

    test('should update URL to /seq/[id] when opening preview in full-screen mode', async ({ page }) => {
        await searchPage.ebolaSudan();

        // Initially on search page
        expect(page.url()).toContain('/search');

        await searchPage.clickOnSequence(0);

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();

        // URL should change to /seq/[id] for full-screen modal
        expect(page.url()).toMatch(/\/seq\/[^/]+$/);
        const seqMatch = page.url().match(/\/seq\/([^/]+)$/);
        expect(seqMatch).not.toBeNull();
        const selectedSeqId = seqMatch[1];

        await searchPage.closePreviewButton().click();

        // URL should return to search page
        expect(page.url()).toContain('/search');

        // Direct navigation to /seq/[id] should open the modal
        await page.goto(`/seq/${selectedSeqId}`);

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    });

    test('should NOT update URL when in docked mode (half-screen)', async ({ page }) => {
        await searchPage.ebolaSudan();

        const searchUrl = page.url();

        await searchPage.clickOnSequence(0);

        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
        
        // URL changes to /seq/[id] in full-screen mode
        expect(page.url()).toMatch(/\/seq\/[^/]+$/);
        const seqMatch = page.url().match(/\/seq\/([^/]+)$/);
        const selectedSeqId = seqMatch[1];

        await searchPage.toggleHalfScreenButton().click();

        await expect(page.locator('[data-testid="half-screen-preview"]')).toBeVisible();
        
        // URL should remain on search page when in docked mode
        expect(page.url()).toContain('/search');
        // Should preserve search parameters
        expect(page.url()).toContain('country=Sudan');

        await searchPage.toggleHalfScreenButton().click();

        // URL should change back to /seq/[id] when returning to full-screen
        expect(page.url()).toContain(`/seq/${selectedSeqId}`);
        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
    });

    test('should handle navigation to /seq/[id] URL directly', async ({ page }) => {
        await searchPage.ebolaSudan();

        await searchPage.clickOnSequence(0);
        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();

        // Get the sequence ID from URL
        const seqMatch = page.url().match(/\/seq\/([^/]+)$/);
        expect(seqMatch).not.toBeNull();
        const selectedSeqId = seqMatch[1];

        await searchPage.closePreviewButton().click();

        // Direct navigation to /seq/[id] should open the modal
        await page.goto(`/seq/${selectedSeqId}`);
        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();

        // Browser back should return to search
        await page.goBack();
        expect(page.url()).toContain('/search');
        
        // Browser forward should reopen modal
        await page.goForward();
        await expect(page.locator('[data-testid="sequence-preview-modal"]')).toBeVisible();
        expect(page.url()).toContain(`/seq/${selectedSeqId}`);
    });
});
