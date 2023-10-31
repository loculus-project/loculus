import { expect, test, testUser } from '../../e2e.fixture';
import { approveProcessedData, submitRevisedDataViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';
import { fakeProcessingPipeline } from '../../util/preprocessingPipeline';

test.describe('The user page', () => {
    test('should show sequence entries, their status and a link to reviews', async ({ userPage, loginAsTestUser }) => {
        const [
            sequenceEntryWithErrors,
            sequenceEntryAwaitingApproval,
            sequenceEntryReleasable,
            sequenceEntryToBeRevised,
        ] = await prepareDataToBe('inProcessing');

        await fakeProcessingPipeline.submit([
            {
                ...sequenceEntryWithErrors,
                error: true,
            },
            {
                ...sequenceEntryAwaitingApproval,
                error: false,
            },
            {
                ...sequenceEntryReleasable,
                error: false,
            },
            {
                ...sequenceEntryToBeRevised,
                error: false,
            },
        ]);

        await approveProcessedData(testUser, [sequenceEntryReleasable, sequenceEntryToBeRevised]);
        await submitRevisedDataViaApi([sequenceEntryToBeRevised.accession]);

        await loginAsTestUser();

        await userPage.gotoUserSequencePage();

        const sequencesArePresent = await userPage.verifyTableEntries([
            {
                ...sequenceEntryWithErrors,
                status: 'HAS_ERRORS',
                isRevocation: false,
            },
            {
                ...sequenceEntryAwaitingApproval,
                status: 'AWAITING_APPROVAL',
                isRevocation: false,
            },
            {
                ...sequenceEntryReleasable,
                status: 'APPROVED_FOR_RELEASE',
                isRevocation: false,
            },
            {
                ...sequenceEntryToBeRevised,
                status: 'APPROVED_FOR_RELEASE',
                isRevocation: false,
            },
        ]);

        expect(sequencesArePresent).toBe(true);
    });
});
