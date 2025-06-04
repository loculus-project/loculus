import { expect } from '@playwright/test';
import { test } from '../../fixtures/sequence.fixture';
import { SearchPage } from '../../pages/search.page';
import { ReviewPage } from '../../pages/review.page';

// This test creates a revocation for a released sequence and verifies
// that the correct banners are displayed on the details page and on
// a deprecated version. It also checks the FASTA download endpoint.

test('sequence detail pages show correct banners and downloads', async ({
    pageWithReleasedSequence: page,
}) => {
    test.setTimeout(120000);
    const search = new SearchPage(page);

    const originalId = await search.waitForLoculusId();
    expect(originalId).toBeTruthy();

    await search.clickOnSequence(0);
    await page.getByRole('link', { name: 'Open in full window' }).click();

    await page.getByRole('button', { name: 'Revoke this sequence' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    const reviewPage = new ReviewPage(page);
    await reviewPage.waitForZeroProcessing();
    await reviewPage.releaseValidSequences();
    await page.getByRole('link', { name: 'Released Sequences' }).click();

    while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
        await page.reload();
        await page.waitForTimeout(2000);
    }

    await search.clickOnSequence(0);
    await page.getByRole('link', { name: 'Open in full window' }).click();

    await expect(page.getByText('This is a revocation version')).toBeVisible();

    const versionButton = page.getByText(/Version/);
    await versionButton.hover();
    await page.getByRole('link', { name: 'All versions' }).click();

    await page.getByRole('link', { name: originalId }).click();

    await expect(
        page.getByText('This is not the latest version of this sequence entry.'),
    ).toBeVisible();
    await expect(page.getByText('This sequence entry has been revoked!')).toBeVisible();

    const faResponse = await page.request.get(`/seq/${originalId}.fa?download`);
    expect(faResponse.ok()).toBeTruthy();
    expect(faResponse.headers()['content-type']).toContain('text/x-fasta');
    expect(faResponse.headers()['content-disposition']).toBe(
        `attachment; filename="${originalId}.fa"`,
    );
});
