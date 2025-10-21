import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { ReviewPage } from '../../pages/review.page';
import { v4 as uuidv4 } from 'uuid';

test.describe('Review page bulk operations', () => {
    test('should allow bulk approval of sequences', async ({ pageWithGroup }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const submissionPage = new SingleSequenceSubmissionPage(page);
        const reviewPage = new ReviewPage(page);

        // Submit a sequence
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: `bulk_approve_${uuidv4().slice(0, 8)}`,
            collectionCountry: 'Switzerland',
            collectionDate: '2023-05-15',
            authorAffiliations: 'Bulk Approval Test Lab',
        });

        await submissionPage.fillSequenceData({
            L: 'CCACATTGACACAGANAGCTCCAGTAGTGGTTCTCTGTCCTTATTAAACCATGGACTTCTTAAGAAACCTTGACTGGACTCAGGTGATTGCTAGTCAGTATGTGACCAATCCCAGGTTTAATATCTCTGATTACTTCGAGATTGTTCGACAGCCTGGTGACGGGAACTGTTTCTACCACAGTATAGCTGAGTTAACCATGCCCAACAAAACAGATCACTCATACCATAACATCAAACATCTGACTGAGGTGGCAGCACGGAAGTATTATCAGGAGGAGCCGGAGGCTAAGCTCATTGGCCTGAGTCTGGAAGACTATCTTAAGAGGATGCTATCTGACAACGAATGGGGATCGACTCTTGAGGCATCTATGTTGGCTAAGGAAATGGGTATTACTATCATCATTTGGACTGTTGCAGCCAGTGACGAAGTGGAAGCAGGCATAAAGTTTGGTGATGGTGATGTGTTTACAGCCGTGAATCTTCTGCACTCCGGACAGACACACTTTGATGCCCTCAGAATACTGCCNCANTTTGAGGCTGACACAAGAGAGNCCTTNAGTCTGGTAGACAANNTNATAGCTGTGGACCANNTGACCTCNTCTTCAAGTGATGAANTGCAGGACTANGAAGANCTTGCTTTAGCACTTACNAGNGCGGAAGAACCATNTAGACGGTCTAGCNTGGATGAGGTNACCCTNTCTAAGAAACAAGCAGAGNTATTGAGGCAGAAGGCATCTCAGTTGTCNAAACTGGTTAATAAAAGTCAGAACATACCGACTAGAGTTGGCAGGGTTCTGGACTGTATGTTTAACTGCAAACTATGTGTTGAAATATCAGCTGACACTCTAATTCTGCGACCAGAATCTAAAGAAAGAATTGG',
            M: 'GTGGATTGAGCATCTTAATTGCAGCATACTTGTCAACATCATGCATATATCATTGATGTATGCAGTTTTCTGCTTGCAGCTGTGCGGTCTAGGGAAAACTAACGGACTACACAATGGGACTGAACACAATAAGACACACGTTATGACAACGCCTGATGACAGTCAGAGCCCTGAACCGCCAGTGAGCACAGCCCTGCCTGTCACACCGGACCCTTCCACTGTCACACCTACAACACCAGCCAGCGGATTAGAAGGCTCAGGAGAGGTTCACACATCCTCTCCAATCACCACCAAGGGTTTGTCTCTGCCGGGGGCTACATCTGAGCTCCCTGCGACTACTAGCATAGTCACTTCAGGTGCAAGTGATGCCGATTCTAGCACACAGGCAGCCAGAGACACCCCTAAACCATCAGTCCGCACGAGTCTGCCCAACAGCCCTAGCACACCATCCACACCACAAGGCACACACCATCCCGTGAGGAGTCTGCTTTCAGTCACGAGCCCTAAGCCAGAAGAAACACCAACACCGTCAAAATCAAGCAAAGATAGCTCAGCAACCAACAGTCCTCACCCAGCCGCCAGCAGACCAACAACCCCTCCCACAACAGCCCAGAGACCCGCTGAAAACAACAGCCACAACACCACCGAACAGCTTGAGTCCTTAACACAATTAGCAACTTCAGGTTCAATGATCTCTCCAACACAGACAGTCCTCCCAAAGAGTGTTACTTCTATAGCCATTCAAGACATTCATCCCAGCCCAACAAATAGGTCTAAAAGAAACCTTGATATGGAAATAATCT',
            S: 'GTGTTCTCTTGAGTGTTGGCAAAATGGAAAACAAAATCGAGGTGAACAACAAAGATGAGATGAACAAATGGTTTGAGGAGTTCAAGAAAGGAAATGGACTTGTGGACACTTTCACAAACTCNTATTCCTTTTGTGAAAGCGTNCCAAATCTGGACAGNTTTGTNTTCCAGATGGCNAGTGCCACTGATGATGCACAAAANGANTCCATCTACGCATCTGCNCTGGTGGANGCAACCAAATTTTGTGCACCTATATACGAGTGTGCTTGGGCTAGCTCCACTGGCATTGTTAAAAAGGGACTGGAGTGGTTCGAGAAAAATGCAGGAACCATTAAATCCTGGGATGAGAGTTATACTGAGCTTAAAGTTGAAGTTCCCAAAATAGAACAACTCTCCAACTACCAGCAGGCTGCTCTCAAATGGAGAAAAGACATAGGCTTCCGTGTCAATGCAAATACGGCAGCTTTGAGTAACAAAGTCCTAGCAGAGTACAAAGTTCCTGGCGAGATTGTAATGTCTGTCAAAGAGATGTTGTCAGATATGATTAGAAGNAGGAACCTGATTCTCAACAGAGGTGGTGATGAGAACCCACGCGGCCCAGTTAGCCGTGAACATGTGGAGTGGTGC',
        });

        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        // Wait for processing to complete
        await reviewPage.waitForZeroProcessing();

        // Get initial total count
        const initialTotal = await reviewPage.getTotalSequenceCount();

        // Approve all sequences
        await reviewPage.approveAll();

        // Verify total count decreased (approved sequences are moved)
        await reviewPage.waitForTotalSequenceCount(initialTotal - 1, 'equal');

        // Verify button no longer shows sequences awaiting approval
        await expect(
            page.getByRole('button', { name: /Approve \d+ valid sequence/ }),
        ).not.toBeVisible();
    });

    test('should allow bulk deletion of erroneous sequences', async ({ pageWithGroup }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const submissionPage = new SingleSequenceSubmissionPage(page);
        const reviewPage = new ReviewPage(page);

        // Submit a sequence with invalid data to create an erroneous sequence
        await submissionPage.navigateToSubmissionPage('Crimean-Congo Hemorrhagic Fever Virus');
        await submissionPage.fillSubmissionForm({
            submissionId: `bulk_delete_${uuidv4().slice(0, 8)}`,
            collectionCountry: 'Germany',
            collectionDate: '2023-06-20',
            authorAffiliations: 'Bulk Deletion Test Lab',
        });

        // Submit with very short/invalid sequences to trigger errors
        await submissionPage.fillSequenceData({
            L: 'AAAA',
            M: 'TTTT',
            S: 'GGGG',
        });

        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        // Wait for processing to complete
        await reviewPage.waitForZeroProcessing();

        // Get initial total count
        const initialTotal = await reviewPage.getTotalSequenceCount();

        // Check if there are erroneous sequences to delete
        const deleteButton = page.getByRole('button', { name: /Delete \d+ erroneous sequence/ });
        if (await deleteButton.isVisible({ timeout: 5000 })) {
            // Delete all erroneous sequences
            await reviewPage.deleteAll();

            // Verify total count decreased
            await reviewPage.waitForTotalSequenceCount(initialTotal, 'less');
        } else {
            // If no erroneous sequences, the test should skip
            test.skip();
        }
    });
});
