import { createFileContent, createModifiedFileContent } from './createFileContent.ts';
import type { Accession, AccessionVersion } from '../../src/types/backend.ts';
import { backendClient, testSequenceCount, testUser } from '../e2e.fixture.ts';

export const submitViaApi = async (numberOfSequences: number = testSequenceCount) => {
    const fileContent = createFileContent(numberOfSequences);

    const response = await backendClient.call('submit', {
        username: testUser,
        metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
        sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
    });

    if (response.isErr()) {
        throw new Error(response.error.detail);
    }
};

export const submitRevisedDataViaApi = async (accessions: Accession[]) => {
    const fileContent = createModifiedFileContent(accessions);

    const response = await backendClient.call(
        'revise',
        {
            username: testUser,
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

export const approveProcessedData = async (username: string, accessionVersions: AccessionVersion[]): Promise<void> => {
    const body = {
        accessionVersions,
    };

    const response = await backendClient.call('approveProcessedData', body, {
        queries: { username },
        headers: { 'Content-Type': 'application/json' },
    });

    if (response.isErr()) {
        throw new Error(`Unexpected error while approving: ${JSON.stringify(response.error)}`);
    }
};
