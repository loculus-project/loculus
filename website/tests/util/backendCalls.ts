import { createFileContent, createModifiedFileContent } from './createFileContent.ts';
import type { SequenceId, SequenceVersion } from '../../src/types/backend.ts';
import { backendClient, testSequenceCount, testuser } from '../e2e.fixture.ts';

export const submitViaApi = async (numberOfSequences: number = testSequenceCount) => {
    const fileContent = createFileContent(numberOfSequences);

    const response = await backendClient.call('submit', {
        username: testuser,
        metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
        sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
    });

    if (response.isErr()) {
        throw new Error(response.error.detail);
    }
};

export const submitRevisedDataViaApi = async (sequenceIds: SequenceId[]) => {
    const fileContent = createModifiedFileContent(sequenceIds);

    const response = await backendClient.call(
        'revise',
        {
            username: testuser,
            metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
            sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
        },
        {
            headers: { 'Content-Type': 'multipart/form-data' },
        },
    );
    if (response.isErr()) {
        throw new Error(response._unsafeUnwrapErr().detail);
    }
};

export const approveProcessedData = async (username: string, sequenceVersions: SequenceVersion[]): Promise<void> => {
    const body = {
        sequenceVersions,
    };

    const response = await backendClient.call('approveProcessedData', body, {
        queries: { username },
        headers: { 'Content-Type': 'application/json' },
    });

    if (response.isErr()) {
        throw new Error(`Unexpected error while approving: ${JSON.stringify(response.error)}`);
    }
};
