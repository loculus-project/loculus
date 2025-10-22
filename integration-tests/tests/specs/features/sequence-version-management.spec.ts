import { test } from '../../fixtures/group.fixture';
import { expect } from '@playwright/test';
import { SequenceDetailsPage } from '../../pages/sequence-details.page';
import {
    submitAndReleaseSequence,
    submitRevision,
    releaseSequencesAndWaitForIndexing,
    getFirstAccessionFromSearch,
} from '../../test-helpers/sequence-workflows';

const TEST_TIMEOUT = 180000; // 3 minutes

test.describe('Sequence version management and banners', () => {
    test('should show deprecated banner on old version and allow navigation to versions page', async ({
        pageWithGroup,
        groupId,
    }) => {
        test.setTimeout(TEST_TIMEOUT);
        const page = pageWithGroup;
        const timestamp = Date.now();

        // Submit and release initial sequence
        await submitAndReleaseSequence(page, groupId, `version-test-${timestamp}`);

        // Get the accession and extract base accession number
        const originalAccession = await getFirstAccessionFromSearch(page, groupId);
        const accessionNumber = originalAccession.split('.')[0];

        // Submit and release a revision
        await submitRevision(
            page,
            groupId,
            originalAccession,
            `version-test-${timestamp}-revised`,
            'GGGG',
        );
        await releaseSequencesAndWaitForIndexing(page, groupId);

        // Test the deprecated version (version 1)
        const sequenceDetailsPage = new SequenceDetailsPage(page);
        const deprecatedVersion = `${accessionNumber}.1`;
        await sequenceDetailsPage.goto(deprecatedVersion);
        await expect(sequenceDetailsPage.notLatestVersionBanner).toBeVisible();

        // Navigate to versions page and verify content
        await sequenceDetailsPage.gotoAllVersions();
        await sequenceDetailsPage.expectVersionsPageHeading(accessionNumber);
        await sequenceDetailsPage.expectVersionLabels();

        // Click link to the latest version and verify no deprecated banner
        const latestVersion = `${accessionNumber}.2`;
        const versionLinkExists = await page.getByRole('link', { name: latestVersion }).count();
        if (versionLinkExists > 0) {
            await sequenceDetailsPage.clickVersionLink(latestVersion);
            await expect(page).toHaveURL(new RegExp(`/seq/${accessionNumber}\\.2`));
            await expect(sequenceDetailsPage.notLatestVersionBanner).not.toBeVisible();
        }
    });

    test('should allow clicking deprecated version link from versions page', async ({
        pageWithGroup,
        groupId,
    }) => {
        test.setTimeout(TEST_TIMEOUT);
        const page = pageWithGroup;
        const timestamp = Date.now();

        // Submit and release initial sequence
        await submitAndReleaseSequence(page, groupId, `link-test-${timestamp}`);

        // Get the accession and extract base accession number
        const originalAccession = await getFirstAccessionFromSearch(page, groupId);
        const accessionNumber = originalAccession.split('.')[0];

        // Submit and release a revision
        await submitRevision(
            page,
            groupId,
            originalAccession,
            `link-test-${timestamp}-revised`,
            'AAAA',
        );
        await releaseSequencesAndWaitForIndexing(page, groupId);

        // Navigate to latest version and go to versions page
        const sequenceDetailsPage = new SequenceDetailsPage(page);
        const latestVersion = `${accessionNumber}.2`;
        await sequenceDetailsPage.goto(latestVersion);
        await sequenceDetailsPage.gotoAllVersions();
        await sequenceDetailsPage.expectVersionsPageHeading(accessionNumber);

        // Click on the deprecated version link and verify
        const deprecatedVersion = `${accessionNumber}.1`;
        await sequenceDetailsPage.clickVersionLink(deprecatedVersion);
        await expect(page).toHaveURL(new RegExp(`/seq/${accessionNumber}\\.1`));
        await expect(sequenceDetailsPage.notLatestVersionBanner).toBeVisible();
    });
});
