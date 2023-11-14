import { expect, test, testuser } from '../../e2e.fixture';
import { approveProcessedData, submitRevisedDataViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';
import { fakeProcessingPipeline } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ userPage }) => {
        const [sequenceNeedsReview, sequenceProcessed, sequenceReleasable, sequenceToBeRevised] =
            await prepareDataToBe('processing');

        await fakeProcessingPipeline.submit([
            {
                ...sequenceNeedsReview,
                error: true,
            },
            {
                ...sequenceProcessed,
                error: false,
            },
            {
                ...sequenceReleasable,
                error: false,
            },
            {
                ...sequenceToBeRevised,
                error: false,
            },
        ]);

        await approveProcessedData(testuser, [sequenceReleasable, sequenceToBeRevised]);
        await submitRevisedDataViaApi([sequenceToBeRevised.sequenceId]);

        await userPage.gotoUserSequencePage();

        const sequencesArePresent = await userPage.verifyTableEntries([
            {
                ...sequenceNeedsReview,
                status: 'NEEDS_REVIEW',
                isRevocation: false,
            },
            {
                ...sequenceProcessed,
                status: 'PROCESSED',
                isRevocation: false,
            },
            {
                ...sequenceReleasable,
                status: 'SILO_READY',
                isRevocation: false,
            },
            {
                ...sequenceToBeRevised,
                status: 'SILO_READY',
                isRevocation: false,
            },
        ]);

        expect(sequencesArePresent).toBe(true);
    });
});
