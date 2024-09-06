import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism, expect, test, testSequenceCount } from '../../e2e.fixture';
import { submitViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

// This test must not be run in parallel with other tests that submit, approve or delete sequences.
test.describe('The review page', () => {
    test('should show the total sequences and an increase when new submission occurs', async ({
        reviewPage,
        loginAsTestUser,
    }) => {
        const { token, groupId } = await loginAsTestUser();

        await reviewPage.goto(groupId);

        const { total } = await reviewPage.getReviewPageOverview();

        await submitViaApi(testSequenceCount, token, groupId);

        await reviewPage.waitForTotalSequenceCountCorrect(total + testSequenceCount);
    });

    test('should allow bulk approval', async ({ reviewPage, loginAsTestUser }) => {
        const { token, groupId } = await loginAsTestUser();

        await reviewPage.goto(groupId);

        const { total } = await reviewPage.getReviewPageOverview();

        await prepareDataToBe('awaitingApproval', token, groupId);

        await reviewPage.waitForTotalSequenceCountCorrect(total + testSequenceCount);

        await reviewPage.approveAll();

        await reviewPage.waitForTotalSequenceCountCorrect(total);
    });

    test('should allow bulk deletion', async ({ reviewPage, loginAsTestUser }) => {
        const { token, groupId } = await loginAsTestUser();

        await prepareDataToBe('erroneous', token, groupId);

        await reviewPage.goto(groupId);

        const { total } = await reviewPage.getReviewPageOverview();

        await reviewPage.deleteAll();

        await reviewPage.waitForTotalSequenceCountCorrect(total, 'less');
    });

    test('approve restricted sequences', async ({ reviewPage, loginAsTestUser }) => {
        const { token, groupId } = await loginAsTestUser();

        await reviewPage.goto(groupId);

        const { total } = await reviewPage.getReviewPageOverview();

        await prepareDataToBe('awaitingApprovalRestricted', token, groupId);

        await reviewPage.waitForTotalSequenceCountCorrect(total + testSequenceCount);

        await reviewPage.approveAll();

        await reviewPage.waitForTotalSequenceCountCorrect(total);

        await reviewPage.page.goto(
            `${baseUrl}${routes.mySequencesPage(dummyOrganism.key, groupId)}dataUseTerms=RESTRICTED`,
        );
        reviewPage.page.getByText(`Search returned ${testSequenceCount} sequence`);

        await reviewPage.page.locator('tr').first().waitFor();
        const rowLocator = reviewPage.page.locator('tr').getByText('LOC').first();
        await rowLocator.click();
        await expect(reviewPage.page.getByText('Restricted sequence')).toBeVisible();
    });
});
