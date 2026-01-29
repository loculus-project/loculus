import { test } from '../../fixtures/group.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { expect } from '@playwright/test';
import { CCHF_L_SEGMENT_FULL_SEQUENCE, CCHF_M_SEGMENT_FULL_SEQUENCE, CCHF_S_SEGMENT_FULL_SEQUENCE } from '../../test-helpers/test-data';

test.describe('Multi-segment multi-reference submission flow', () => {
    test('submit single sequence, edit and release', async ({ page, groupId }) => {
        test.setTimeout(120_000);

        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('CCHF (Multi-Ref)');
        await submissionPage.fillSubmissionForm({
            submissionId: 'MSMR-TEST-001',
            collectionCountry: 'Laos',
            collectionDate: '2023-10-15',
            authorAffiliations: 'Research Lab, University',
        });
        await submissionPage.fillSequenceData({ mySequence: 'should not align' });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
        const editPage = await reviewPage.editFirstSequence();

        await editPage.discardSequenceFile();
        await editPage.addSequenceFile(`>key\n${CCHF_S_SEGMENT_FULL_SEQUENCE}\n${CCHF_L_SEGMENT_FULL_SEQUENCE}`);
        await editPage.fillField('Authors', 'Integration, Test');
        await editPage.submitChanges();

        await reviewPage.waitForAllProcessed();
        const releasedPage = await reviewPage.releaseAndGoToReleasedSequences();

        await releasedPage.waitForSequencesInSearch(1);
        await releasedPage.expectResultTableCellText('S');
        const accessionVersions = await releasedPage.waitForSequencesInSearch(1);
        const firstAccessionVersion = accessionVersions[0];
        await releasedPage.openPreviewOfAccessionVersion(`${firstAccessionVersion.accession}.1`);
        const expectedDisplayName = new RegExp(
            `^Display Name: Laos/${firstAccessionVersion.accession}\\.1`,
        );
        await expect(page.getByText(expectedDisplayName)).toBeVisible();
    });

    test('revoke a sequence', async ({ page, groupId }) => {
        test.setTimeout(120_000);

        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('CCHF (Multi-Ref)');
        await submissionPage.fillSubmissionForm({
            submissionId: 'id',
            collectionCountry: 'Uganda',
            collectionDate: '2023-10-15',
            authorAffiliations: 'Research Lab, University',
        });
        await submissionPage.fillSequenceData({ mySequence: CCHF_L_SEGMENT_FULL_SEQUENCE });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
        const releasedPage = await reviewPage.releaseAndGoToReleasedSequences();

        const accessionVersions = await releasedPage.waitForSequencesInSearch(1);
        await releasedPage.expectResultTableCellText('L');
        const firstAccessionVersion = accessionVersions[0];
        await releasedPage.openPreviewOfAccessionVersion(firstAccessionVersion.accessionVersion);
        await releasedPage.revokeSequence('revocation for integration test');

        await reviewPage.waitForAllProcessed();
        await reviewPage.releaseAndGoToReleasedSequences();

        await releasedPage.waitForAccessionVersionInSearch(firstAccessionVersion.accession, 2);
        await releasedPage.openPreviewOfAccessionVersion(`${firstAccessionVersion.accession}.2`);
        await expect(page.getByText(/This is a revocation version/)).toBeVisible();
    });

    test('submit files and revise released version', async ({ page, groupId }) => {
        test.setTimeout(120_000);

        void groupId;
        const submissionPage = new BulkSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('CCHF (Multi-Ref)');
        await submissionPage.uploadMetadataFile(
            ['id', 'geoLocCountry', 'sampleCollectionDate', 'fastaIds'],
            [
                ['first', 'Laos', '2023-10-15', 'first_S first_M first_L'],
                ['second', 'Laos', '2023-10-16', 'second_L'],
            ],
        );
        await submissionPage.uploadSequencesFile({
            first_S: CCHF_S_SEGMENT_FULL_SEQUENCE,
            first_M: CCHF_M_SEGMENT_FULL_SEQUENCE,
            first_L: CCHF_L_SEGMENT_FULL_SEQUENCE,
            second_L: CCHF_L_SEGMENT_FULL_SEQUENCE,
        });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
        const releasedPage = await reviewPage.releaseAndGoToReleasedSequences();

        const accessionVersions = await releasedPage.waitForSequencesInSearch(2);
        await releasedPage.expectResultTableCellText('S');
        await releasedPage.expectResultTableCellText('M');

        const firstAccessionVersion = accessionVersions[0];
        await releasedPage.openPreviewOfAccessionVersion(firstAccessionVersion.accessionVersion);
        const editPage = await releasedPage.reviseSequence();

        const authorAffiliations = 'integration test affiliation';
        await editPage.fillField('Author affiliations', authorAffiliations);
        await editPage.submitChanges();

        await reviewPage.waitForAllProcessed();
        await reviewPage.releaseAndGoToReleasedSequences();

        await releasedPage.waitForAccessionVersionInSearch(firstAccessionVersion.accession, 2);
        await releasedPage.expectResultTableCellText(authorAffiliations);
        await releasedPage.openPreviewOfAccessionVersion(`${firstAccessionVersion.accession}.2`);
        const expectedDisplayName = new RegExp(
            `^Display Name: Laos/${firstAccessionVersion.accession}\\.2`,
        );
        await expect(page.getByText(expectedDisplayName)).toBeVisible();
    });
});
