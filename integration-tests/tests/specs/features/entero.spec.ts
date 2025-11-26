import { test } from '../../fixtures/group.fixture';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';

test.describe('EV sequence submission', () => {
    test('submit something', async ({ page, groupId }) => {
        void groupId;
        const submissionPage = new SingleSequenceSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('Enterovirus');
        await submissionPage.fillSubmissionForm({
            submissionId: 'TEST-ID-123',
            collectionCountry: 'Uganda',
            collectionDate: '2023-10-15',
            authorAffiliations: 'Research Lab, University',
        });
        await submissionPage.fillSequenceData({ mySequence: a71Sequence });
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();
        await page.waitForURL('**/review');
    });

    test('submit files', async ({ page, groupId }) => {
        void groupId;
        const submissionPage = new BulkSubmissionPage(page);

        await submissionPage.navigateToSubmissionPage('Enterovirus');
        await submissionPage.uploadMetadataFile(
            ['id', 'collection_country', 'collection_date'],
            [
                ['first', 'Uganda', '2023-10-15'],
                ['second', 'Uganda', '2023-10-16'],
            ],
        );
        await submissionPage.uploadSequencesFile({
            first_shouldBeA71: a71Sequence,
            second_shouldBeD68: d68Sequence,
        });
        await submissionPage.acceptTerms();
        const reviewPage = await submissionPage.submitSequence();

        await reviewPage.waitForAllProcessed();
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
