import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { ReviewPage } from '../../pages/review.page';
import { v4 as uuidv4 } from 'uuid';

test.describe('Review page operations', () => {
    test('should show the total sequences and an increase when new submission occurs', async ({
        pageWithGroup,
    }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const reviewPage = new ReviewPage(page);

        await reviewPage.navigateToReviewPage();
        const initialTotal = await reviewPage.getTotalSequenceCount();

        // Submit a new sequence
        const submissionPage = new SingleSequenceSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Ebola Sudan');
        await submissionPage.fillSubmissionForm({
            submissionId: `test_${uuidv4().slice(0, 8)}`,
            collectionCountry: 'Nigeria',
            collectionDate: '2024-01-15',
            authorAffiliations: 'Test Institute',
        });
        await submissionPage.fillSequenceData({
            main: 'ATCGATCGATCGATCG',
        });
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        await reviewPage.waitForZeroProcessing();
        await reviewPage.waitForTotalSequenceCount(initialTotal + 1);
    });

    test('should allow bulk approval', async ({ pageWithGroup }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const reviewPage = new ReviewPage(page);

        // Submit a sequence to approve
        const submissionPage = new SingleSequenceSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Ebola Sudan');
        await submissionPage.fillSubmissionForm({
            submissionId: `test_approve_${uuidv4().slice(0, 8)}`,
            collectionCountry: 'Kenya',
            collectionDate: '2024-02-01',
            authorAffiliations: 'Test Lab',
        });
        await submissionPage.fillSequenceData({
            main: 'ATCGATCGATCGATCGATCG',
        });
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        await reviewPage.waitForZeroProcessing();
        const totalBeforeApproval = await reviewPage.getTotalSequenceCount();

        await reviewPage.approveAll();

        // After approval, the sequence should be moved to released
        await expect
            .poll(
                async () => {
                    const currentTotal = await reviewPage.getTotalSequenceCount();
                    return currentTotal < totalBeforeApproval;
                },
                {
                    message: 'Total sequence count should decrease after approval',
                    timeout: 30000,
                },
            )
            .toBe(true);
    });

    test('should allow bulk deletion', async ({ pageWithGroup }) => {
        test.setTimeout(120000);
        const page = pageWithGroup;
        const reviewPage = new ReviewPage(page);

        // Submit a sequence with errors to delete
        const submissionPage = new SingleSequenceSubmissionPage(page);
        await submissionPage.navigateToSubmissionPage('Ebola Sudan');
        await submissionPage.fillSubmissionForm({
            submissionId: `test_delete_${uuidv4().slice(0, 8)}`,
            collectionCountry: 'Tanzania',
            collectionDate: '2024-03-01',
            authorAffiliations: 'Test Institute',
        });
        // Submit with invalid sequence data to create errors
        await submissionPage.fillSequenceData({
            main: 'XXX', // Invalid sequence
        });
        await submissionPage.acceptTerms();
        await submissionPage.submitSequence();

        await reviewPage.waitForZeroProcessing();
        const totalBeforeDeletion = await reviewPage.getTotalSequenceCount();

        // Check if there's a delete button visible
        const deleteButton = page.getByRole('button', { name: /Delete \d+ sequence/ });
        if (await deleteButton.isVisible({ timeout: 5000 })) {
            await reviewPage.deleteAll();

            // After deletion, the sequence count should decrease
            await expect
                .poll(
                    async () => {
                        const currentTotal = await reviewPage.getTotalSequenceCount();
                        return currentTotal < totalBeforeDeletion;
                    },
                    {
                        message: 'Total sequence count should decrease after deletion',
                        timeout: 30000,
                    },
                )
                .toBe(true);
        }
    });
});
