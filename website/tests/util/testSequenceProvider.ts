import type { AccessionVersion } from '../../src/types/backend.ts';

export type TestSequenceContainer = {
    testSequenceEntry: AccessionVersion;
    revokedSequenceEntry: AccessionVersion;
    revocationSequenceEntry: AccessionVersion;
    deprecatedSequenceEntry: AccessionVersion;
    revisedSequenceEntry: AccessionVersion;
};

export const getTestSequences = (): TestSequenceContainer => {
    if (process.env.TEST_SEQUENCES === undefined) {
        throw new Error('TEST_SEQUENCES is not set. Preparation failed.');
    }
    return JSON.parse(process.env.TEST_SEQUENCES) as TestSequenceContainer;
};

export const setTestSequences = (testSequences: TestSequenceContainer) => {
    process.env.TEST_SEQUENCES = JSON.stringify(testSequences);
};
