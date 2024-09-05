import { approveProcessedData, revokeReleasedData, submitRevisedDataViaApi, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import type { AccessionVersion } from '../../src/types/backend.ts';
import { extractAccessionVersion } from '../../src/utils/extractAccessionVersion.ts';
import { testSequenceCount } from '../e2e.fixture.ts';

export const prepareDataToBe = (
    state:
        | 'approvedForRelease'
        | 'erroneous'
        | 'awaitingApproval'
        | 'revoked'
        | 'revisedForRelease'
        | 'awaitingApprovalRestricted',
    token: string,
    groupId: number,
): Promise<AccessionVersion[]> => {
    switch (state) {
        case 'approvedForRelease':
            return prepareDataToBeApprovedForRelease(token, groupId);
        case 'erroneous':
            return prepareDataToHaveErrors(token, groupId);
        case 'awaitingApproval':
            return prepareDataToBeAwaitingApproval(token, groupId);
        case 'awaitingApprovalRestricted':
            return prepareDataToBeAwaitingApproval(token, groupId, true);
        case 'revoked':
            return prepareDataToBeRevoked(token, groupId);
        case 'revisedForRelease':
            return prepareDataToBeRevisedForRelease(token, groupId);
    }
};

const absurdlyManySoThatAllSequencesAreInProcessing = 10_000;

async function prepareDataToBeProcessing(token: string, groupId: number, restricted: boolean = false) {
    const submittedSequences = await submitViaApi(testSequenceCount, token, groupId, restricted);

    await fakeProcessingPipeline.query(absurdlyManySoThatAllSequencesAreInProcessing);

    return submittedSequences;
}

const prepareDataToHaveErrors = async (token: string, groupId: number) => {
    const sequenceEntries = await prepareDataToBeProcessing(token, groupId);

    const options: PreprocessingOptions[] = sequenceEntries
        .map(extractAccessionVersion)
        .map((sequence) => ({ ...sequence, error: true }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeAwaitingApproval = async (token: string, groupId: number, restricted: boolean = false) => {
    const sequenceEntries = await prepareDataToBeProcessing(token, groupId, restricted);

    const options: PreprocessingOptions[] = sequenceEntries.map((sequence) => ({ ...sequence, error: false }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeApprovedForRelease = async (token: string, groupId: number) => {
    const sequenceEntries = await prepareDataToBeAwaitingApproval(token, groupId);

    await approveProcessedData(sequenceEntries, token, groupId);

    return sequenceEntries;
};

const prepareDataToBeRevoked = async (token: string, groupId: number) => {
    const sequenceEntries = await prepareDataToBeApprovedForRelease(token, groupId);

    return revokeReleasedData(
        sequenceEntries.map((entry) => entry.accession),
        token,
        groupId,
    );
};

const prepareDataToBeRevisedForRelease = async (token: string, groupId: number) => {
    const sequenceEntries = await prepareDataToBeApprovedForRelease(token, groupId);

    const submittedRevisionAccessionVersion = await submitRevisedDataViaApi(
        sequenceEntries.map((entry) => entry.accession),
        token,
    );

    await fakeProcessingPipeline.query(absurdlyManySoThatAllSequencesAreInProcessing);

    const options: PreprocessingOptions[] = submittedRevisionAccessionVersion.map((sequence) => ({
        accession: sequence.accession,
        version: sequence.version,
        error: false,
    }));
    await fakeProcessingPipeline.submit(options);

    await approveProcessedData(submittedRevisionAccessionVersion, token, groupId);

    return submittedRevisionAccessionVersion;
};
