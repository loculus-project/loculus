import { approveProcessedData, revokeReleasedData, submitRevisedDataViaApi, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import type { AccessionVersion } from '../../src/types/backend.ts';
import { extractAccessionVersion } from '../../src/utils/extractAccessionVersion.ts';
import { testSequenceCount } from '../e2e.fixture.ts';

export const prepareDataToBe = (
    state: 'approvedForRelease' | 'erroneous' | 'awaitingApproval' | 'revoked' | 'revisedForRelease',
    token: string,
    numberOfSequenceEntries: number = testSequenceCount,
): Promise<AccessionVersion[]> => {
    switch (state) {
        case 'approvedForRelease':
            return prepareDataToBeApprovedForRelease(numberOfSequenceEntries, token);
        case 'erroneous':
            return prepareDataToHaveErrors(numberOfSequenceEntries, token);
        case 'awaitingApproval':
            return prepareDataToBeAwaitingApproval(numberOfSequenceEntries, token);
        case 'revoked':
            return prepareDataToBeRevoked(numberOfSequenceEntries, token);
        case 'revisedForRelease':
            return prepareDataToBeRevisedForRelease(numberOfSequenceEntries, token);
    }
};

const absurdlyManySoThatAllSequencesAreInProcessing = 10_000;

async function prepareDataToBeProcessing(numberOfSequenceEntries: number, token: string) {
    const submittedSequences = await submitViaApi(numberOfSequenceEntries, token);

    await fakeProcessingPipeline.query(absurdlyManySoThatAllSequencesAreInProcessing);

    return submittedSequences;
}

const prepareDataToHaveErrors = async (numberOfSequenceEntries: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeProcessing(numberOfSequenceEntries, token);

    const options: PreprocessingOptions[] = sequenceEntries
        .map(extractAccessionVersion)
        .map((sequence) => ({ ...sequence, error: true }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeAwaitingApproval = async (numberOfSequenceEntries: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeProcessing(numberOfSequenceEntries, token);

    const options: PreprocessingOptions[] = sequenceEntries.map((sequence) => ({ ...sequence, error: false }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeApprovedForRelease = async (
    numberOfSequenceEntries: number = testSequenceCount,
    token: string,
) => {
    const sequenceEntries = await prepareDataToBeAwaitingApproval(numberOfSequenceEntries, token);

    await approveProcessedData(sequenceEntries, token);

    return sequenceEntries;
};

const prepareDataToBeRevoked = async (numberOfSequenceEntries: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeApprovedForRelease(numberOfSequenceEntries, token);

    return revokeReleasedData(
        sequenceEntries.map((entry) => entry.accession),
        token,
    );
};

const prepareDataToBeRevisedForRelease = async (numberOfSequenceEntries: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeApprovedForRelease(numberOfSequenceEntries, token);

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

    await approveProcessedData(submittedRevisionAccessionVersion, token);

    return submittedRevisionAccessionVersion;
};
