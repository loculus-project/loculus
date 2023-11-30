import { expect, test } from '../../e2e.fixture';
import { submitRevisedDataViaApi } from '../../util/backendCalls.ts';
import { prepareDataToBe } from '../../util/prepareDataToBe.ts';

test.describe('The user page', () => {
    test('should show sequence entries, their status and a link to the editPage', async ({
        userPage,
        loginAsTestUser,
    }) => {
        const { token } = await loginAsTestUser();

        const sequenceEntryAwaitingApproval = (await prepareDataToBe('awaitingApproval', token, 1))[0];
        const sequenceEntryWithErrors = (await prepareDataToBe('erroneous', token))[0];
        const sequenceEntryReleasable = (await prepareDataToBe('approvedForRelease', token))[0];
        const sequenceEntryToBeRevised = (await prepareDataToBe('approvedForRelease', token))[0];
        await submitRevisedDataViaApi([sequenceEntryToBeRevised.accession], token);

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
