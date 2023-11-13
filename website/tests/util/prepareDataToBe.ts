import { approveProcessedData, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import { type UnprocessedData } from '../../src/types/backend.ts';
import { extractAccessionVersion } from '../../src/utils/extractAccessionVersion.ts';
import { expect, testSequenceCount, testuser } from '../e2e.fixture.ts';

export const prepareDataToBe = (
    state: 'approvedForRelease' | 'erroneous' | 'awaitingApproval' | 'inProcessing',
    numberOfSequences: number = testSequenceCount,
): Promise<UnprocessedData[]> => {
    switch (state) {
        case 'inProcessing':
            return prepareDataToBeProcessing(numberOfSequences);
        case 'approvedForRelease':
            return prepareDataToBeApprovedForRelease(numberOfSequences);
        case 'erroneous':
            return prepareDataToHaveErrors(numberOfSequences);
        case 'awaitingApproval':
            return prepareDataToBeAwaitingApproval(numberOfSequences);
    }
};

async function prepareDataToBeProcessing(numberOfSequences: number) {
    await submitViaApi(numberOfSequences);

    const sequenceEntries = await fakeProcessingPipeline.query(numberOfSequences);
    expect(sequenceEntries.length).toBe(numberOfSequences);

    return sequenceEntries;
}

const prepareDataToHaveErrors = async (numberOfSequences: number = testSequenceCount) => {
    const sequenceEntries = await prepareDataToBeProcessing(numberOfSequences);

    const options: PreprocessingOptions[] = sequenceEntries
        .map(extractAccessionVersion)
        .map((sequence) => ({ ...sequence, error: true }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeAwaitingApproval = async (numberOfSequences: number = testSequenceCount) => {
    const sequenceEntries = await prepareDataToBeProcessing(numberOfSequences);

    const options: PreprocessingOptions[] = sequenceEntries
        .map(extractAccessionVersion)
        .map((sequence) => ({ ...sequence, error: false }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeApprovedForRelease = async (numberOfSequences: number = testSequenceCount) => {
    const sequenceEntries = await prepareDataToBeAwaitingApproval(numberOfSequences);

    await approveProcessedData(testuser, sequenceEntries);

    return sequenceEntries;
};
