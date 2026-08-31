import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { SearchPage } from '../../pages/search.page';
import { SequenceDetailPage } from '../../pages/sequence-detail.page';

test.describe('Sequence detail page metadata', () => {
    test('should display sample details section with metadata fields', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await expect(page.getByText('Sample details')).toBeVisible();
        await expect(page.getByText('Collection date')).toBeVisible();
        await expect(page.getByText('Sampling location')).toBeVisible();
    });

    test('should display submission details section', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await expect(page.getByText('Submission details')).toBeVisible();
        await expect(page.getByText('Submission ID')).toBeVisible();
        await expect(page.getByText('Submitting group')).toBeVisible();
        await expect(page.getByText('Date submitted')).toBeVisible();
        await expect(page.getByText('Date released')).toBeVisible();
    });

    test('should display data use terms section', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await expect(page.getByText('Data use terms').first()).toBeVisible();
        // "OPEN" appears as text with a link next to it — use exact match
        await expect(page.getByText('OPEN', { exact: true }).first()).toBeVisible();
    });

    test('should display mutation sections', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        await expect(page.getByText('Nucleotide mutations')).toBeVisible();
        await expect(page.getByText('Amino acid mutations')).toBeVisible();
        await expect(page.getByText('Substitutions').first()).toBeVisible();
    });

    test('should display version selector and download button', async ({ page }) => {
        const searchPage = new SearchPage(page);
        await searchPage.ebolaSudan();

        const accessionVersions = await searchPage.waitForSequencesInSearch(1);
        const { accessionVersion } = accessionVersions[0];

        const detailPage = new SequenceDetailPage(page);
        await detailPage.goto(accessionVersion);

        // Version dropdown should be visible
        await expect(page.getByText(/Version \d+/)).toBeVisible();

        // Download button should be visible — use exact text match
        await expect(page.getByText('Download', { exact: true })).toBeVisible();
    });
});
