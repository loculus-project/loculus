import type { ReviewPage } from './review.page.ts';
import type { SequenceVersion } from '../../../src/types.ts';
import { test, expect } from '../../e2e.fixture';
import type { SubmitPage } from '../submit/submit.page.ts';
import type { UserPage } from '../user/user.page.ts';

test.describe('The review page', () => {
    test(
        'should show the review page for a sequence that needs review, ' +
            'download the sequence and submit the review',
        async ({ reviewPage, submitPage, userPage }) => {
            const [testSequence] = await submitPage.prepareDataToBeReviewable();
            expect(testSequence).toBeDefined();

            await testReviewFlow(reviewPage, submitPage, userPage, testSequence);
        },
    );

    test('should show the review page for a staged sequence, download the sequence and submit the review', async ({
        reviewPage,
        submitPage,
        userPage,
    }) => {
        const [testSequence] = await submitPage.prepareDataToBeStaged();
        expect(testSequence).toBeDefined();

        await testReviewFlow(reviewPage, submitPage, userPage, testSequence);
    });

    const testReviewFlow = async (
        reviewPage: ReviewPage,
        submitPage: SubmitPage,
        userPage: UserPage,
        testSequence: SequenceVersion,
    ) => {
        await userPage.gotoUserSequencePage();
        await userPage.clickOnReviewForSequence(testSequence);

        expect(await reviewPage.page.isVisible(`text=Review for Id: ${testSequence.sequenceId}`)).toBe(true);
        expect(await reviewPage.page.isVisible(`text=Original Data`)).toBe(true);
        expect(await reviewPage.page.isVisible(`text=Processed Data`)).toBe(true);

        await reviewPage.downloadAndVerify(testSequence);

        await reviewPage.submit();

        await userPage.gotoUserSequencePage();
        await userPage.verifyTableEntries([{ ...testSequence, status: 'REVIEWED', isRevocation: false }]);
    };
});
