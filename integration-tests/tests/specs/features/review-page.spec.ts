import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { ReviewPage } from '../../pages/review.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { createTestMetadata, createTestSequenceData } from '../../test-helpers/test-data';

test.describe('Review page functionality', () => {
    test('should show total sequences and increase when new submission occurs', async ({
        pageWithGroup,
        groupId,
    }) => {
        const reviewPage = new ReviewPage(pageWithGroup);
        await reviewPage.goto(groupId);

        const initialOverview = await reviewPage.getReviewPageOverview();
        const initialTotal = initialOverview.total;

        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);
        await submissionPage.completeSubmission(createTestMetadata(), createTestSequenceData());

        await reviewPage.goto(groupId);
        await reviewPage.waitForTotalSequenceCountCorrect(initialTotal + 1);

        const newOverview = await reviewPage.getReviewPageOverview();
        expect(newOverview.total).toBe(initialTotal + 1);
    });

    test('should allow bulk approval of sequences', async ({ pageWithGroup, groupId }) => {
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        // Submit 3 sequences to test bulk operations properly
        for (let i = 0; i < 3; i++) {
            await submissionPage.completeSubmission(createTestMetadata(), createTestSequenceData());
        }

        const reviewPage = new ReviewPage(pageWithGroup);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();

        const beforeApproval = await reviewPage.getReviewPageOverview();
        expect(beforeApproval.total).toBeGreaterThanOrEqual(3);
        expect(beforeApproval.processed).toBeGreaterThanOrEqual(3);

        await reviewPage.approveAll();

        // After approval, sequences are released and should no longer be in review
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });

    test('should allow bulk deletion of sequences', async ({ pageWithGroup, groupId }) => {
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        // Submit 3 sequences to test bulk operations properly
        for (let i = 0; i < 3; i++) {
            await submissionPage.completeSubmission(createTestMetadata(), createTestSequenceData());
        }

        const reviewPage = new ReviewPage(pageWithGroup);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();

        const beforeDeletion = await reviewPage.getReviewPageOverview();
        expect(beforeDeletion.total).toBeGreaterThanOrEqual(3);

        await reviewPage.deleteAll();

        // After deletion, total should return to 0
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });
});
