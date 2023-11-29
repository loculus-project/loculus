import { approveProcessedData, submitViaApi } from './backendCalls.ts';
import { fakeProcessingPipeline, type PreprocessingOptions } from './preprocessingPipeline.ts';
import type { AccessionVersion } from '../../src/types/backend.ts';
import { extractAccessionVersion } from '../../src/utils/extractAccessionVersion.ts';
import { testSequenceCount } from '../e2e.fixture.ts';

export const prepareDataToBe = (
    state: 'approvedForRelease' | 'erroneous' | 'awaitingApproval',
    token: string,
    numberOfSequences: number = testSequenceCount,
): Promise<AccessionVersion[]> => {
    switch (state) {
        case 'approvedForRelease':
            return prepareDataToBeApprovedForRelease(numberOfSequences, token);
        case 'erroneous':
            return prepareDataToHaveErrors(numberOfSequences, token);
        case 'awaitingApproval':
            return prepareDataToBeAwaitingApproval(numberOfSequences, token);
    }
};

const absurdlyManySoThatAllSequencesAreInProcessing = 10_000;

async function prepareDataToBeProcessing(numberOfSequences: number, token: string) {
    const submittedSequences = await submitViaApi(numberOfSequences, token);

    await fakeProcessingPipeline.query(absurdlyManySoThatAllSequencesAreInProcessing);

    return submittedSequences;
}

const prepareDataToHaveErrors = async (numberOfSequences: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeProcessing(numberOfSequences, token);

    const options: PreprocessingOptions[] = sequenceEntries
        .map(extractAccessionVersion)
        .map((sequence) => ({ ...sequence, error: true }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeAwaitingApproval = async (numberOfSequences: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeProcessing(numberOfSequences, token);

    const options: PreprocessingOptions[] = sequenceEntries.map((sequence) => ({ ...sequence, error: false }));
    await fakeProcessingPipeline.submit(options);

    return sequenceEntries;
};

const prepareDataToBeApprovedForRelease = async (numberOfSequences: number = testSequenceCount, token: string) => {
    const sequenceEntries = await prepareDataToBeAwaitingApproval(numberOfSequences, token);

    await approveProcessedData(sequenceEntries, token);

    return sequenceEntries;
};
