import { expect } from '@playwright/test';
import { test } from '../../fixtures/group.fixture';
import { ReviewPage } from '../../pages/review.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';

const TEST_SEQUENCE =
    'ATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAA' +
    'TATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG';

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
        await submissionPage.completeSubmission(
            {
                submissionId: `review-test-${Date.now()}`,
                collectionCountry: 'Switzerland',
                collectionDate: '2021-01-15',
                authorAffiliations: 'Test Institute',
                groupId: groupId.toString(),
            },
            {
                main: TEST_SEQUENCE,
            },
        );

        await reviewPage.goto(groupId);
        await reviewPage.waitForTotalSequenceCountCorrect(initialTotal + 1);

        const newOverview = await reviewPage.getReviewPageOverview();
        expect(newOverview.total).toBe(initialTotal + 1);
    });

    test('should allow bulk approval of sequences', async ({ pageWithGroup, groupId }) => {
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: `bulk-approve-${Date.now()}`,
                collectionCountry: 'France',
                collectionDate: '2021-02-20',
                authorAffiliations: 'Research Lab',
                groupId: groupId.toString(),
            },
            {
                main: TEST_SEQUENCE,
            },
        );

        await reviewPage.waitForZeroProcessing();

        const beforeApproval = await reviewPage.getReviewPageOverview();
        expect(beforeApproval.total).toBeGreaterThan(0);
        expect(beforeApproval.processed).toBeGreaterThan(0);

        await reviewPage.approveAll();

        // After approval, sequences are released and should no longer be in review
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });

    test('should allow bulk deletion of sequences', async ({ pageWithGroup, groupId }) => {
        const submissionPage = new SingleSequenceSubmissionPage(pageWithGroup);

        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: `bulk-delete-${Date.now()}`,
                collectionCountry: 'Germany',
                collectionDate: '2021-03-25',
                authorAffiliations: 'University Hospital',
                groupId: groupId.toString(),
            },
            {
                main: TEST_SEQUENCE,
            },
        );

        await reviewPage.waitForZeroProcessing();

        const beforeDeletion = await reviewPage.getReviewPageOverview();
        expect(beforeDeletion.total).toBeGreaterThan(0);

        await reviewPage.deleteAll();

        // After deletion, total should return to 0
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });
});
