import { expect } from '@playwright/test';
import { test } from '../../fixtures/sequence.fixture';
import { SequenceDetailsPage } from '../../pages/sequence-details.page';
import { SearchPage } from '../../pages/search.page';

test.describe('Sequence details page', () => {
    test('can load and show sequence data', async ({ pageWithReleasedSequence: page }) => {
        test.setTimeout(90000);

        const searchPage = new SearchPage(page);
        await searchPage.cchf();

        // Get the first sequence from the search results
        const loculusId = await searchPage.waitForLoculusId();
        expect(loculusId).toBeTruthy();

        if (loculusId) {
            const sequenceDetailsPage = new SequenceDetailsPage(page);
            await sequenceDetailsPage.navigateToSequence(loculusId);

            // Initially sequences should not be visible
            const sequenceContent = page.getByTestId('fixed-length-text-viewer');
            await expect(sequenceContent).not.toBeVisible();

            // Load sequences
            await sequenceDetailsPage.loadSequences();

            // Now sequences should be visible
            await expect(sequenceContent).toBeVisible();

            // Verify we can switch between segments
            const tabs = page.locator('.tab');
            const tabCount = await tabs.count();
            if (tabCount > 1) {
                const secondTabText = await tabs.nth(1).textContent();
                if (secondTabText) {
                    await sequenceDetailsPage.selectSegment(secondTabText.trim());
                    await expect(sequenceContent).toBeVisible();
                }
            }
        }
    });

    test('displays sequence metadata correctly', async ({ pageWithReleasedSequence: page }) => {
        test.setTimeout(90000);

        const searchPage = new SearchPage(page);
        await searchPage.cchf();

        const loculusId = await searchPage.waitForLoculusId();
        expect(loculusId).toBeTruthy();

        if (loculusId) {
            const sequenceDetailsPage = new SequenceDetailsPage(page);
            await sequenceDetailsPage.navigateToSequence(loculusId);

            // Verify metadata is displayed
            await expect(page.getByText('Collection country')).toBeVisible();
            await expect(page.getByText('Collection date')).toBeVisible();

            // Verify the accession is displayed in the header
            await expect(page.getByText(loculusId)).toBeVisible();
        }
    });

    test('can navigate to versions page', async ({ pageWithReleasedSequence: page }) => {
        test.setTimeout(90000);

        const searchPage = new SearchPage(page);
        await searchPage.cchf();

        const loculusId = await searchPage.waitForLoculusId();
        expect(loculusId).toBeTruthy();

        if (loculusId) {
            const sequenceDetailsPage = new SequenceDetailsPage(page);
            await sequenceDetailsPage.navigateToSequence(loculusId);

            // Check if "View all versions" link is available
            const versionsLink = page.getByRole('link', { name: /View all versions/i });
            const isVisible = await versionsLink.isVisible({ timeout: 5000 }).catch(() => false);

            if (isVisible) {
                await sequenceDetailsPage.gotoAllVersions();

                // Extract accession (without version) from loculusId
                const accession = loculusId.split('.')[0];
                await expect(page.getByText(`Versions for accession ${accession}`)).toBeVisible();
            }
        }
    });
});
