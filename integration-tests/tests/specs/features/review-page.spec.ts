import { expect } from '@playwright/test';
import { test } from '../../fixtures/console-warnings.fixture';
import { AuthPage } from '../../pages/auth.page';
import { ReviewPage } from '../../pages/review.page';
import { SingleSequenceSubmissionPage } from '../../pages/submission.page';
import { readonlyUser } from '../../fixtures/user.fixture';
import { createTestGroup } from '../../fixtures/group.fixture';
import { GroupPage } from '../../pages/group.page';

test.describe('Review page functionality', () => {
    test('should show total sequences and increase when new submission occurs', async ({
        page,
    }) => {
        const authPage = new AuthPage(page);
        await authPage.tryLoginOrRegister(readonlyUser);

        const groupPage = new GroupPage(page);
        const testGroup = createTestGroup();
        const groupId = await groupPage.getOrCreateGroup(testGroup);

        const reviewPage = new ReviewPage(page);
        await reviewPage.goto(groupId);

        const initialOverview = await reviewPage.getReviewPageOverview();
        const initialTotal = initialOverview.total;

        const submissionPage = new SingleSequenceSubmissionPage(page);
        const mainSequence =
            'ATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAA' +
            'TATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG';

        await submissionPage.completeSubmission(
            {
                submissionId: `review-test-${Date.now()}`,
                collectionCountry: 'Switzerland',
                collectionDate: '2021-01-15',
                authorAffiliations: 'Test Institute',
                groupId: groupId.toString(),
            },
            {
                main: mainSequence,
            },
        );

        await reviewPage.goto(groupId);
        await reviewPage.waitForTotalSequenceCountCorrect(initialTotal + 1);

        const newOverview = await reviewPage.getReviewPageOverview();
        expect(newOverview.total).toBe(initialTotal + 1);
    });

    test('should allow bulk approval of sequences', async ({ page }) => {
        const authPage = new AuthPage(page);
        await authPage.tryLoginOrRegister(readonlyUser);

        const groupPage = new GroupPage(page);
        const testGroup = createTestGroup();
        const groupId = await groupPage.getOrCreateGroup(testGroup);

        const submissionPage = new SingleSequenceSubmissionPage(page);
        const mainSequence =
            'ATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAA' +
            'TATTAACAGCCGGGCTTTCGGTCCAACAAGGGATTGTGCGACAAAGAGTCATCCCGGTATATGTTGTGAG';

        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: `bulk-approve-${Date.now()}`,
                collectionCountry: 'France',
                collectionDate: '2021-02-20',
                authorAffiliations: 'Research Lab',
                groupId: groupId.toString(),
            },
            {
                main: mainSequence,
            },
        );

        await reviewPage.waitForZeroProcessing();

        const beforeApproval = await reviewPage.getReviewPageOverview();
        expect(beforeApproval.total).toBeGreaterThan(0);
        expect(beforeApproval.processed).toBeGreaterThan(0);

        await reviewPage.approveAll();

        // After approval, sequences are released and should no longer be in review
        // Since we started with a fresh group, total should return to 0
        await reviewPage.waitForTotalSequenceCountCorrect(0);
    });

    test('should allow bulk deletion of sequences', async ({ page }) => {
        const authPage = new AuthPage(page);
        await authPage.tryLoginOrRegister(readonlyUser);

        const groupPage = new GroupPage(page);
        const testGroup = createTestGroup();
        const groupId = await groupPage.getOrCreateGroup(testGroup);

        const submissionPage = new SingleSequenceSubmissionPage(page);
        const mainSequence =
            'ATGGATAAACGGGTGAGAGGTTCATGGGCCCTGGGAGGACAATCTGAAGTTGATCTTGACTACCACAAAA';

        const reviewPage = await submissionPage.completeSubmission(
            {
                submissionId: `bulk-delete-${Date.now()}`,
                collectionCountry: 'Germany',
                collectionDate: '2021-03-25',
                authorAffiliations: 'University Hospital',
                groupId: groupId.toString(),
            },
            {
                main: mainSequence,
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
