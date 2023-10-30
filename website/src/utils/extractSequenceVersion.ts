import type { SequenceVersion } from '../types/backend.ts';

export const extractSequenceVersion = (sequence: SequenceVersion) => ({
    sequenceId: sequence.sequenceId,
    version: sequence.version,
});

export const getSequenceVersionString = (sequence: SequenceVersion) => {
    return `${sequence.sequenceId}.${sequence.version}`;
};
