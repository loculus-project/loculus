import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { ReviewPage } from '../../pages/review.page';
import { BulkSubmissionPage, SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { createTestMetadata, createTestSequenceData } from '../../test-helpers/test-data';

test.describe('Review page functionality', () => {
    test('can navigate to review page via UI', async ({ page, groupId }) => {
        void groupId;
        const reviewPage = new ReviewPage(page);
        await reviewPage.navigateToReviewPage();
        await expect(
            page.getByRole('heading', { name: 'Review current submissions' }),
        ).toBeVisible();
    });

    test('should show total sequences and increase when new submission occurs', async ({
        page,
        groupId,
    }) => {
        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);

        const initialOverview = await reviewPage.getReviewPageOverview();
        const initialTotal = initialOverview.total;

        const submissionPage = new SingleSequenceSubmissionPage(page);
        await submissionPage.completeSubmission(createTestMetadata(), createTestSequenceData());

        await reviewPage.goto(groupId);
        await reviewPage.waitForTotalSequenceCountCorrect(initialTotal + 1);

        const newOverview = await reviewPage.getReviewPageOverview();
        expect(newOverview.total).toBe(initialTotal + 1);
    });

    test('should allow bulk approval of sequences', async ({ page, groupId }) => {
        test.setTimeout(120_000);
        const submissionPage = new BulkSubmissionPage(page);

        // Use bulk submission for efficiency
        await submissionPage.completeBulkSubmission({
            count: 3,
            metadata: createTestMetadata(),
            sequenceData: createTestSequenceData(),
            groupId,
        });

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();

        const beforeApproval = await reviewPage.getReviewPageOverview();
        expect(beforeApproval.total).toBeGreaterThanOrEqual(3);
        expect(beforeApproval.processed).toBeGreaterThanOrEqual(3);

        await reviewPage.approveAll();

        // After approval, sequences are released and should no longer be in review
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });

    test('should allow bulk discarding of sequences', async ({ page, groupId }) => {
        test.setTimeout(120_000);
        const submissionPage = new BulkSubmissionPage(page);

        // Use bulk submission for efficiency
        await submissionPage.completeBulkSubmission({
            count: 3,
            metadata: createTestMetadata(),
            sequenceData: createTestSequenceData(),
            groupId,
        });

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);
        await reviewPage.waitForZeroProcessing();

        const beforeDiscarding = await reviewPage.getReviewPageOverview();
        expect(beforeDiscarding.total).toBeGreaterThanOrEqual(3);

        await reviewPage.discardAll();

        // After deletion, total should return to 0
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });
});
