import { expect, openDataUseTerms, test, testSequenceCount } from '../../../e2e.fixture';
import { submitRevisedDataViaApi } from '../../../util/backendCalls.ts';
import { prepareDataToBe } from '../../../util/prepareDataToBe.ts';

test.describe('The user sequence page', () => {
    test('should show sequence entries, their status and a link to the editPage', async ({
        userPage,
        loginAsTestUser,
    }) => {
        const { token, groupName } = await loginAsTestUser();

        const [sequenceEntryAwaitingApproval] = await prepareDataToBe(
            'awaitingApproval',
            token,
            testSequenceCount,
            groupName,
        );
        const [sequenceEntryWithErrors] = await prepareDataToBe('erroneous', token, testSequenceCount, groupName);
        const [sequenceEntryReleasable] = await prepareDataToBe(
            'approvedForRelease',
            token,
            testSequenceCount,
            groupName,
        );
        const [sequenceEntryToBeRevised] = await prepareDataToBe(
            'approvedForRelease',
            token,
            testSequenceCount,
            groupName,
        );
        await submitRevisedDataViaApi([sequenceEntryToBeRevised.accession], token);

        await userPage.gotoUserSequencePage();

        const sequencesArePresent = await userPage.verifyTableEntries([
            {
                ...sequenceEntryWithErrors,
                status: 'HAS_ERRORS',
                isRevocation: false,
                submissionId: 'custom1',
                dataUseTerms: openDataUseTerms,
            },
            {
                ...sequenceEntryAwaitingApproval,
                status: 'AWAITING_APPROVAL',
                isRevocation: false,
                submissionId: 'custom1',
                dataUseTerms: openDataUseTerms,
            },
            {
                ...sequenceEntryReleasable,
                status: 'APPROVED_FOR_RELEASE',
                isRevocation: false,
                submissionId: 'custom1',
                dataUseTerms: openDataUseTerms,
            },
            {
                ...sequenceEntryToBeRevised,
                status: 'APPROVED_FOR_RELEASE',
                isRevocation: false,
                submissionId: 'custom1',
                dataUseTerms: openDataUseTerms,
            },
        ]);

        expect(sequencesArePresent).toBe(true);
    });
});
