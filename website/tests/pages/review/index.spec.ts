import { test, testSequenceCount } from '../../e2e.fixture';
import { submitViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

test.describe('The review page', () => {
    test('should show the total sequences and an increase when new submission occurs', async ({
        reviewPage,
        loginAsTestUser,
    }) => {
        const { token, groupName } = await loginAsTestUser();

        await reviewPage.goto();

        const { total } = await reviewPage.getReviewPageOverview();

        await submitViaApi(testSequenceCount, token, groupName);

        await reviewPage.waitForTotalSequencesFulfillPredicate(
            (totalSequenceCount) => totalSequenceCount === total + testSequenceCount,
        );
    });

    test('should allow bulk approval', async ({ reviewPage, loginAsTestUser }) => {
        const { token, groupName } = await loginAsTestUser();

        await reviewPage.goto();

        const { total } = await reviewPage.getReviewPageOverview();

        await prepareDataToBe('awaitingApproval', token, testSequenceCount, groupName);

        await reviewPage.waitForTotalSequencesFulfillPredicate(
            (totalSequenceCount) => totalSequenceCount === total + testSequenceCount,
        );

        await reviewPage.approveAll();

        await reviewPage.waitForTotalSequencesFulfillPredicate((totalSequenceCount) => totalSequenceCount === total);
    });

    test('should allow bulk deletion', async ({ reviewPage, loginAsTestUser }) => {
        const { token, groupName } = await loginAsTestUser();

        await prepareDataToBe('erroneous', token, testSequenceCount, groupName);

        await reviewPage.goto();

        const { total } = await reviewPage.getReviewPageOverview();

        await reviewPage.deleteAll();

        await reviewPage.waitForTotalSequencesFulfillPredicate((totalSequenceCount) => totalSequenceCount < total);
    });
});
