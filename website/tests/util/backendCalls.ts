import { createFileContent, createModifiedFileContent } from './createFileContent.ts';
import type { Accession, AccessionVersion } from '../../src/types/backend.ts';
import { backendClient, dummyOrganism, testSequenceCount } from '../e2e.fixture.ts';
import { createAuthorizationHeader } from '../../src/utils/createAuthorizationHeader.ts';

export const submitViaApi = async (numberOfSequences: number = testSequenceCount, token: string) => {
    const fileContent = createFileContent(numberOfSequences);

    const response = await backendClient.call(
        'submit',
        {
            metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
            sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
        },
        {
            params: { organism: dummyOrganism.key },
            headers: createAuthorizationHeader(token),
        },
    );

    if (response.isOk()) {
        return response.value;
    }
    throw new Error(response.error.detail);
};

export const submitRevisedDataViaApi = async (accessions: Accession[], token: string) => {
    const fileContent = createModifiedFileContent(accessions);

    const response = await backendClient.call(
        'revise',
        {
            metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
            sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
        },
        {
            params: { organism: dummyOrganism.key },
            headers: createAuthorizationHeader(token),
        },
    );
    if (response.isErr()) {
        throw new Error(response.error.detail);
    }
};

export const approveProcessedData = async (accessionVersions: AccessionVersion[], token: string): Promise<void> => {
    const body = {
        accessionVersions,
    };

    const response = await backendClient.call('approveProcessedData', body, {
        params: { organism: dummyOrganism.key },
        headers: createAuthorizationHeader(token!),
    });

    if (response.isErr()) {
        throw new Error(`Unexpected error while approving: ${JSON.stringify(response.error)}`);
    }
};
