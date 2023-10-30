import { approveProcessedData, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import { type UnprocessedData } from '../../src/types/backend.ts';
import { extractSequenceVersion } from '../../src/utils/extractSequenceVersion.ts';
import { expect, testSequenceCount, testuser } from '../e2e.fixture.ts';

export const prepareDataToBe = (
    state: 'releasable' | 'reviewable' | 'staged' | 'processing',
    numberOfSequences: number = testSequenceCount,
): Promise<UnprocessedData[]> => {
    switch (state) {
        case 'processing':
            return prepareDataToBeProcessing(numberOfSequences);
        case 'releasable':
            return prepareDataToBeReleasable(numberOfSequences);
        case 'reviewable':
            return prepareDataToBeReviewable(numberOfSequences);
        case 'staged':
            return prepareDataToBeStaged(numberOfSequences);
    }
};

async function prepareDataToBeProcessing(numberOfSequences: number) {
    await submitViaApi(numberOfSequences);

    const sequences = await fakeProcessingPipeline.query(numberOfSequences);
    expect(sequences.length).toBe(numberOfSequences);

    return sequences;
}

const prepareDataToBeReviewable = async (numberOfSequences: number = testSequenceCount) => {
    const sequences = await prepareDataToBeProcessing(numberOfSequences);

    const options: PreprocessingOptions[] = sequences
        .map(extractSequenceVersion)
        .map((sequence) => ({ ...sequence, error: true }));
    await fakeProcessingPipeline.submit(options);

    return sequences;
};

const prepareDataToBeStaged = async (numberOfSequences: number = testSequenceCount) => {
    const sequences = await prepareDataToBeProcessing(numberOfSequences);

    const options: PreprocessingOptions[] = sequences
        .map(extractSequenceVersion)
        .map((sequence) => ({ ...sequence, error: false }));
    await fakeProcessingPipeline.submit(options);

    return sequences;
};

const prepareDataToBeReleasable = async (numberOfSequences: number = testSequenceCount) => {
    const sequences = await prepareDataToBeStaged(numberOfSequences);

    await approveProcessedData(testuser, sequences);

    return sequences;
};
