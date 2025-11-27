import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { ReviewPage } from '../../pages/review.page';
import { SearchPage } from '../../pages/search.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { SequenceDetailPage } from '../../pages/sequence-detail.page';
import { randomUUID } from 'crypto';

const TEST_SEQUENCE =
    'ATTGATCTCATCATTTACCAATTGGAGACCGTTTAACTAGTCAATCCCCCATTTGGGGGCATTCCTAAAGTGTTGCAA' +
    'AGGTATGTGGGTCGTATTGCTTTGCCTTTTCCTAACCTGGCTCCTCCTACAATTCTAACCTGCTTGATAAGTGTGATTACCTG' +
    'AGTAATAGACTAATTTCGTCCTGGTAATTAGCATTTTCTAGTAAAACCAATACTATCTCAAGTCCTAAGAGGAGGTGAGAAGA' +
    'GGGTCTCGAGGTATCCCTCCAGTCCACAAAATCTAGCTAATTTTAGCTGAGTGGACTGATTACTCTCATCACACGCTAACTAC' +
    'TAAGGGTTTACCTGAGAGCCTACAACATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTT' +
    'GACTACCACAAAATATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG' +
    'TGATCTTGAGGGTATTTGTCAACATATCATTCAGGCCTTTGAAGCAGGCGTAGATTTCCAAGATAATGCTGACAGCTTCCTTT' +
    'TACTTTTATGTTTACATCATGCTTACCAAGGAGATCATAGGCTCTTCCTCAAAAGTGATGCAGTTCAATACTTAGAGGGCCAT' +
    'GGTTTCAGGTTTGAGGTCCGAGAAAAGGAGAATGTGCACCGTCTGGATGAATTGTTGCCCAATGTCACCGGTGGAAAAAATCT' +
    'TAGGAGAACATTGGCTGCAATGCCTGAAGAGGAGACAACAGAAGCTAACGCTGGTCAGTTTTTATCCTTTGCCAGTTTGTTTC' +
    'TACCCAAACTTGTCGTTGGGGAGAAAGCGTGTCTGGAAAAAGTACAAAGGCAGATTCAGGTCCATGCAGAACAAGGGCTCATT' +
    'CAATATCCAACTTCCTGGCAATCAGTTGGACACATGATGGTGATCTTCCGTTTGATGAGAACAAACTTTTTAATCAAGTTCCT' +
    'ACTAATACATCAGGGGATGCACATGG';

test.describe('Sequence version banners', () => {
    test('shows correct banners for revoked, revocation, deprecated, and revised entries', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(300_000);
        void groupId;

        const uuid = randomUUID();
        const submissionPage = new SingleSequenceSubmissionPage(page);
        const search = new SearchPage(page);

        // Submit two sequences - one to revise, one to revoke
        await page.goto('/');
        await submissionPage.completeSubmission(
            {
                submissionId: 'to-revise',
                collectionCountry: 'France',
                collectionDate: '2023-01-01',
                authorAffiliations: uuid,
            },
            { main: TEST_SEQUENCE },
        );

        await page.goto('/');
        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: 'to-revoke',
                collectionCountry: 'Germany',
                collectionDate: '2023-01-02',
                authorAffiliations: uuid,
            },
            { main: TEST_SEQUENCE },
        );

        // Release both sequences
        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();
        await page.getByRole('link', { name: 'released sequences' }).click();

        // Wait for sequences to appear in search
        while (!(await page.getByText('Search returned 2 sequences').isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

        // Find and revise the France sequence
        await search.ebolaSudan();
        await search.enableSearchFields('Author affiliations');
        await search.fill('Author affiliations', uuid);
        await search.select('Collection country', 'France');

        // Get the accession of the sequence to revise
        const toReviseLink = page.getByRole('link', { name: /LOC_[A-Z0-9]+\.1/ });
        const toReviseId = await toReviseLink.textContent();
        const toReviseAccession = toReviseId.split('.')[0];

        // Click on the sequence and revise it
        await page.getByRole('cell', { name: 'France' }).click();
        await page.getByRole('link', { name: 'Revise this sequence' }).click();
        await page.getByLabel('Collection date').fill('2023-06-15');
        await page.getByRole('button', { name: 'Submit' }).click();
        await page.getByRole('button', { name: 'Confirm' }).click();
        await expect(page.getByText('Review current submissions')).toBeVisible();

        // Find and revoke the Germany sequence
        await search.ebolaSudan();
        await search.enableSearchFields('Author affiliations');
        await search.fill('Author affiliations', uuid);
        await search.select('Collection country', 'Germany');

        // Get the accession of the sequence to revoke
        const toRevokeLink = page.getByRole('link', { name: /LOC_[A-Z0-9]+\.1/ });
        const toRevokeId = await toRevokeLink.textContent();
        const toRevokeAccession = toRevokeId.split('.')[0];

        // Click on the sequence and revoke it
        await page.getByRole('cell', { name: 'Germany' }).click();
        await page.getByRole('button', { name: 'Revoke this sequence' }).click();
        await page.getByRole('button', { name: 'Confirm' }).click();

        // Release the revision and revocation
        const reviewPage2 = new ReviewPage(page);
        await reviewPage2.waitForZeroProcessing();
        await reviewPage2.releaseValidSequences();
        await page.getByRole('link', { name: 'released sequences' }).click();

        // Wait for the revised sequence to appear (with new date)
        while (!(await page.getByRole('cell', { name: '2023-06-15' }).isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

        // Now test all the banners
        const detailPage = new SequenceDetailPage(page);

        // Test 1: Revoked entry (v1 of revoked sequence) - should show revocation banner + not latest
        const revokedAccessionVersion = `${toRevokeAccession}.1`;
        await detailPage.goto(revokedAccessionVersion);
        await detailPage.expectRevocationBanner();
        await detailPage.expectNotLatestVersionBanner();

        // Test 2: Revocation entry (v2 of revoked sequence) - should show "This is a revocation version."
        const revocationAccessionVersion = `${toRevokeAccession}.2`;
        await detailPage.goto(revocationAccessionVersion);
        await detailPage.expectRevocationVersionBanner();

        // Test 3: Deprecated entry (v1 of revised sequence) - should show not latest version banner
        const deprecatedAccessionVersion = `${toReviseAccession}.1`;
        await detailPage.goto(deprecatedAccessionVersion);
        await detailPage.expectNotLatestVersionBanner();

        // Test 4: Revised entry (v2 of revised sequence) - should NOT show not latest version banner
        const revisedAccessionVersion = `${toReviseAccession}.2`;
        await detailPage.goto(revisedAccessionVersion);
        await detailPage.expectNoNotLatestVersionBanner();
    });

    test('can navigate to versions page and click deprecated version link', async ({
        page,
        groupId,
    }) => {
        test.setTimeout(200_000);
        void groupId;

        const uuid = randomUUID();
        const submissionPage = new SingleSequenceSubmissionPage(page);

        // Submit a sequence
        await page.goto('/');
        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: 'for-versions',
                collectionCountry: 'Spain',
                collectionDate: '2023-03-01',
                authorAffiliations: uuid,
            },
            { main: TEST_SEQUENCE },
        );

        // Release the sequence
        await reviewPage.waitForZeroProcessing();
        await reviewPage.releaseValidSequences();
        await page.getByRole('link', { name: 'released sequences' }).click();

        // Wait for sequence to appear
        while (!(await page.getByRole('link', { name: /LOC_/ }).isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

        // Get the accession
        const search = new SearchPage(page);
        await search.ebolaSudan();
        await search.enableSearchFields('Author affiliations');
        await search.fill('Author affiliations', uuid);

        const seqLink = page.getByRole('link', { name: /LOC_[A-Z0-9]+\.1/ });
        const seqId = await seqLink.textContent();
        const accession = seqId.split('.')[0];

        // Revise the sequence
        await page.getByRole('cell', { name: 'Spain' }).click();
        await page.getByRole('link', { name: 'Revise this sequence' }).click();
        await page.getByLabel('Collection date').fill('2023-09-20');
        await page.getByRole('button', { name: 'Submit' }).click();
        await page.getByRole('button', { name: 'Confirm' }).click();

        // Release the revision
        const reviewPage2 = new ReviewPage(page);
        await reviewPage2.waitForZeroProcessing();
        await reviewPage2.releaseValidSequences();
        await page.getByRole('link', { name: 'released sequences' }).click();

        // Wait for revised sequence
        while (!(await page.getByRole('cell', { name: '2023-09-20' }).isVisible())) {
            await page.reload();
            await page.waitForTimeout(2000);
        }

        // Navigate to the revised (latest) entry
        const detailPage = new SequenceDetailPage(page);
        const revisedAccessionVersion = `${accession}.2`;
        const deprecatedAccessionVersion = `${accession}.1`;

        await detailPage.goto(revisedAccessionVersion);

        // Navigate to versions page
        await detailPage.gotoAllVersions();

        // Verify versions page content
        await detailPage.expectVersionsPageFor(accession);
        await detailPage.expectLatestVersionLabel();
        await detailPage.expectPreviousVersionLabel();

        // Click on the deprecated version link
        await detailPage.clickVersionLink(deprecatedAccessionVersion);

        // Verify we navigated to the deprecated version page
        await page.waitForURL(`**/seq/${deprecatedAccessionVersion}`);
    });
});
