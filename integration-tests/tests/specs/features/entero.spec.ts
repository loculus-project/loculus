import { test } from '../../fixtures/group.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { expect } from '@playwright/test';

test.describe('EV sequence submission', () => {
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
        await expect(page.getByRole('cell', { name: 'EV-A71' })).toBeVisible();
    });

    test('submit files', async ({ page, groupId }) => {
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
        await expect(page.getByRole('cell', { name: 'EV-A71' })).toBeVisible();
        await expect(page.getByRole('cell', { name: 'EV-D68' })).toBeVisible();

        const firstAccessionVersion = accessionVersions[0];
        await releasedPage.openPreviewOfAccessionVersion(firstAccessionVersion.accession);
        const editPage = await releasedPage.reviseSequence();

        const authorAffiliations = 'integration test affiliation';
        await editPage.fillField('Author affiliations', authorAffiliations);
        await editPage.submitChanges();

        await reviewPage.waitForAllProcessed();
        await reviewPage.releaseAndGoToReleasedSequences();

        await expect
            .poll(
                async () => {
                    await page.reload();
                    const accessionVersions = await releasedPage.getAccessionVersions();
                    return accessionVersions.some(
                        ({ accession, version }) =>
                            accession === firstAccessionVersion.accession && version === 2,
                    );
                },
                {
                    message: `Did not find revised accession version ${firstAccessionVersion.accession}.2`,
                    timeout: 60000,
                    intervals: [2000, 5000],
                },
            )
            .toBeTruthy();
        await expect(page.getByRole('cell', { name: authorAffiliations })).toBeVisible();
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
