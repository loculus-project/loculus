import { approveProcessedData, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import type { AccessionVersion } from '../../src/types/backend.ts';
import { extractAccessionVersion } from '../../src/utils/extractAccessionVersion.ts';
import { testSequenceCount } from '../e2e.fixture.ts';

export const prepareDataToBe = (
    state: 'approvedForRelease' | 'erroneous' | 'awaitingApproval',
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
