import { expect, test, testuser } from '../../e2e.fixture';
import { approveProcessedData, submitRevisedDataViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';
import { fakeProcessingPipeline } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequences, their status and a link to reviews', async ({ userPage }) => {
        const [sequenceHasErrors, sequenceAwaitingApproval, sequenceReleasable, sequenceToBeRevised] =
            await prepareDataToBe('inProcessing');

        await fakeProcessingPipeline.submit([
            {
                ...sequenceHasErrors,
                error: true,
            },
            {
                ...sequenceAwaitingApproval,
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
                ...sequenceHasErrors,
                status: 'HAS_ERRORS',
                isRevocation: false,
            },
            {
                ...sequenceAwaitingApproval,
                status: 'AWAITING_APPROVAL',
                isRevocation: false,
            },
            {
                ...sequenceReleasable,
                status: 'APPROVED_FOR_RELEASE',
                isRevocation: false,
            },
            {
                ...sequenceToBeRevised,
                status: 'APPROVED_FOR_RELEASE',
                isRevocation: false,
            },
        ]);

        expect(sequencesArePresent).toBe(true);
    });
});
