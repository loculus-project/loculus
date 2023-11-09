import { type ReviewPage } from './review.page.ts';
import type { SequenceVersion } from '../../../src/types/backend.ts';
import { baseUrl, expect, test, testuser } from '../../e2e.fixture';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';
import type { UserPage } from '../user/user.page.ts';

test.describe('The review page', () => {
    test(
        'should show the review page for a sequence that needs review, ' +
            'download the sequence and submit the review',
        async ({ userPage, reviewPage }) => {
            const [erroneousTestSequence] = await prepareDataToBe('erroneous', 1);
            const [stagedTestSequence] = await prepareDataToBe('awaitingApproval', 1);

            expect(erroneousTestSequence).toBeDefined();
            expect(stagedTestSequence).toBeDefined();

            await userPage.gotoUserSequencePage();

            await testReviewFlow(reviewPage, userPage, erroneousTestSequence);
            await testReviewFlow(reviewPage, userPage, stagedTestSequence);
        },
    );

    const testReviewFlow = async (reviewPage: ReviewPage, userPage: UserPage, testSequence: SequenceVersion) => {
        await userPage.clickOnReviewForSequence(testSequence);

        expect(await reviewPage.page.isVisible(`text=Review for Id: ${testSequence.sequenceId}`)).toBe(true);
        expect(await reviewPage.page.isVisible(`text=Original Data`)).toBe(true);
        expect(await reviewPage.page.isVisible(`text=Processed Data`)).toBe(true);

        await reviewPage.downloadAndVerify(testSequence);

        await reviewPage.submit();

        await reviewPage.page.waitForURL(`${baseUrl}/user/${testuser}/sequences`);
    };
});
