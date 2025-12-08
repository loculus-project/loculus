import { test } from '../../fixtures/group.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { expect } from '@playwright/test';

test.describe('Multi-pathogen submission flow', () => {
    test('submit single sequence, edit and release', async ({ page, groupId }) => {
        test.setTimeout(120_000);

        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('Enterovirus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'TEST-ID-123',
            collectionCountry: 'Uganda',
            collectionDate: '2023-10-15',
            authorAffiliations: 'Research Lab, University',
        });
        await submissionPage.fillSequenceData({ mySequence: 'should not align' });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
        const editPage = await reviewPage.editFirstSequence();

        await editPage.discardSequenceFile();
        await editPage.addSequenceFile(`>key\n${a71Sequence}`);
        await editPage.fillField('Authors', 'Integration, Test');
        await editPage.submitChanges();

        await reviewPage.waitForAllProcessed();
        const releasedPage = await reviewPage.releaseAndGoToReleasedSequences();

        await releasedPage.waitForSequencesInSearch(1);
        await releasedPage.expectResultTableCellText('EV-A71');
    });

    test('revoke a sequence', async ({ page, groupId }) => {
        test.fail();
        test.setTimeout(120_000);

        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('Enterovirus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'id',
            collectionCountry: 'Uganda',
            collectionDate: '2023-10-15',
            authorAffiliations: 'Research Lab, University',
        });
        await submissionPage.fillSequenceData({ mySequence: a71Sequence });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
        const releasedPage = await reviewPage.releaseAndGoToReleasedSequences();

        const accessionVersions = await releasedPage.waitForSequencesInSearch(1);
        await releasedPage.expectResultTableCellText('EV-A71');
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

        await submissionPage.navigateToSubmissionPage('Enterovirus');
        await submissionPage.uploadMetadataFile(
            ['id', 'geoLocCountry', 'sampleCollectionDate'],
            [
                ['first', 'Uganda', '2023-10-15'],
                ['second', 'Uganda', '2023-10-16'],
            ],
        );
        await submissionPage.uploadSequencesFile({
            first: a71Sequence,
            second: d68Sequence,
        });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
        const releasedPage = await reviewPage.releaseAndGoToReleasedSequences();

        const accessionVersions = await releasedPage.waitForSequencesInSearch(2);
        await releasedPage.expectResultTableCellText('EV-A71');
        await releasedPage.expectResultTableCellText('EV-D68');

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
            `^Display Name: Uganda/${firstAccessionVersion.accession}\\.2`,
        );
        await expect(page.getByText(expectedDisplayName)).toBeVisible();
    });
});

const a71Sequence =
    'TCATCAAATGCTAGTGATGAGAGCATGATCGAGACGCGGTGTGTTCTTAATTCACATAGCACAGCTGAGACTACTCTTGATAGCTTTTTCAGCAGAGCAG' +
    'GATTAGTTGGAGAAATAGATCTCCCCCTTGAAGGCACAACCAATCCGAATGGGTACGCAAACTGGGACATAGATATAACAGGTTACGCACAAATGCGTAG' +
    'AAAGGTAGAGCTGTTCACCTATATGCGTTTCGACGCAGAGTTCACCTTTGTTGCATGCACGCCCACCGGGGAAGTCGTCCCGCAGTTGCTCCAATATATG' +
    'TTTGTACCACCCGGAGCCCCCAAGCCAGACTCCAGGGAATCTCTCGCATGGCAAACTGCCACTAATCCTTCAGTCTTTGTGAAGCTGTCAGACCCCCCAG' +
    'CACAGGTCTCAGTTCCGTTCATGTCACCTGCGAGCGCCTACCAATGGTTTTATGACGGGTATCCTACATTTGGTGAGCACAAGCAGGAGAAAGATCTTGA' +
    'ATACGGGGCATGCCCAAACAACATGATGGGCACGTTCTCAGTGCGGACTGTAGGAACCTCGAAGTCCAAGTACCCACTGGTGATTAGGATCTACATGAGG' +
    'ATGAAGCATGTCAGGGCGTGGATACCTCGCCCTATGCGCAACCAAAATTATCTATTCAAAGCCAATCCAAATTATGCTGGCAATTCCATCAAACCAACTG' +
    'GCGCCAGTCGCACAGCAATCACCACCCTCGG';

const d68Sequence =
    'GTTTGGGATTTTGGATTACAATCTAGTGTCACCTTGGTGATACCTTGGATTAGTGGATCTCACTACAGGATGTTCAACAATGACGCTAAGTCAACCAATG' +
    'CCAACGTTGGCTATGTTACCTGTTTTATGCAAACTAATCTAATAGTCCCCAGTGAATCCTCTAACACATGTTCCTTAATAGGGTTCGTAGCAGCAAAAGA' +
    'TGACTTTTCCCTTAGGTTAATGAGAGATAGCCCTGACATTAGGCAATTAGACCACTTACATGCAGCAGAGGCAGCCTACCAGATCGAGAGCATCATCAAA' +
    'ACAGCAACTGACACTGTAAAAAGCGAGATTAACGCTGAACTTGGTGTGGTCCCTAGCTTAAATGCAGTTGAAACGGGTGCAAGTTCTAACACCGAACCAG' +
    'AGGAAGCCATACAAACTCGCACAGTGATAAATCAGCATGGCGTGTCTGAGACATTAGTGGAGAATTTTCTTAGTAGGGCAGCCTTAGTATCAAAGAGAAG' +
    'CTTCGAGTACAAAAATCATGCCTCATCTGAAGCACAAACAGACAAAAACTTTTTCAAATGGACGATTAATACCAAGTCCTTTGTCCAGTTAAGGAGAAAG' +
    'CTGGAATTGTTCACATACCTTAGATTTGATGCTGAAGTCACCATACTCACAACTGTGGCAGTAAGTAGCAGTAACAGCACATACACAGGCCTTCCTGATT' +
    'TGACACTTCAAGCA';
