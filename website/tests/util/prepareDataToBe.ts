import { approveProcessedData, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import { type UnprocessedData } from '../../src/types/backend.ts';
import { extractSequenceVersion } from '../../src/utils/extractSequenceVersion.ts';
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

    const sequences = await fakeProcessingPipeline.query(numberOfSequences);
    expect(sequences.length).toBe(numberOfSequences);

    return sequences;
}

const prepareDataToHaveErrors = async (numberOfSequences: number = testSequenceCount) => {
    const sequences = await prepareDataToBeProcessing(numberOfSequences);

    const options: PreprocessingOptions[] = sequences
        .map(extractSequenceVersion)
        .map((sequence) => ({ ...sequence, error: true }));
    await fakeProcessingPipeline.submit(options);

    return sequences;
};

const prepareDataToBeAwaitingApproval = async (numberOfSequences: number = testSequenceCount) => {
    const sequences = await prepareDataToBeProcessing(numberOfSequences);

    const options: PreprocessingOptions[] = sequences
        .map(extractSequenceVersion)
        .map((sequence) => ({ ...sequence, error: false }));
    await fakeProcessingPipeline.submit(options);

    return sequences;
};

const prepareDataToBeApprovedForRelease = async (numberOfSequences: number = testSequenceCount) => {
    const sequences = await prepareDataToBeAwaitingApproval(numberOfSequences);

    await approveProcessedData(testuser, sequences);

    return sequences;
};
