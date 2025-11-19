import { routes } from '../../../src/routes/routes.ts';
import { baseUrl, dummyOrganism, expect, test, testSequenceCount } from '../../e2e.fixture';
import { submitViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

// This test must not be run in parallel with other tests that submit, approve or delete sequences.
test.describe('The review page', () => {
    test('approve restricted sequences', async ({ reviewPage, loginAsTestUser, browserName }) => {
        test.skip(browserName === 'webkit', 'Webkit has false positive connection issues');
        const { token, groupId } = await loginAsTestUser();

        await reviewPage.goto(groupId);

        const { total } = await reviewPage.getReviewPageOverview();

        await prepareDataToBe('awaitingApprovalRestricted', token, groupId);

        await reviewPage.waitForTotalSequenceCountCorrect(total + testSequenceCount);

        await reviewPage.approveAll();

        await reviewPage.waitForTotalSequenceCountCorrect(total);

        const page = reviewPage.page;

        await page.goto(`${baseUrl}${routes.mySequencesPage(dummyOrganism.key, groupId)}dataUseTerms=RESTRICTED`);

        await expect
            .poll(
                async () => {
                    await page.reload();
                    return page.getByText(`Search returned ${testSequenceCount} sequence`).isVisible();
                },
                {
                    message: 'Correct number of sequences never appeared on the page.',
                    timeout: 60000,
                },
            )
            .toBe(true);

        const rowLocator = page.locator('a[href*="/seq/LOC"]').first();
        await expect(rowLocator).toBeVisible();
        await rowLocator.click();
        await expect(page.getByText('Restricted-Use sequence')).toBeVisible();
    });
});
