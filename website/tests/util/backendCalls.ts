import { createFileContent, createModifiedFileContent } from './createFileContent.ts';
import {
    type Accession,
    type AccessionVersion,
    deleteAllDataScope,
    openDataUseTermsType,
} from '../../src/types/backend.ts';
import { createAuthorizationHeader } from '../../src/utils/createAuthorizationHeader.ts';
import {
    backendClient,
    DEFAULT_GROUP_NAME,
    dummyOrganism,
    groupManagementClient,
    testSequenceCount,
} from '../e2e.fixture.ts';

export const submitViaApi = async (
    numberOfSequenceEntries: number = testSequenceCount,
    token: string,
    groupName: string = DEFAULT_GROUP_NAME,
) => {
    const fileContent = createFileContent(numberOfSequenceEntries);

    const response = await backendClient.call(
        'submit',
        {
            metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
            sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
            groupName,
            dataUseTermsType: openDataUseTermsType,
            restrictedUntil: null,
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

export const submitRevisedDataViaApi = async (accessions: Accession[], token: string): Promise<AccessionVersion[]> => {
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
    return response.value;
};

export const approveProcessedData = async (accessionVersions: AccessionVersion[], token: string): Promise<void> => {
    const body = {
        accessionVersionsFilter: accessionVersions,
        scope: 'ALL' as const,
    };

    const response = await backendClient.call('approveProcessedData', body, {
        params: { organism: dummyOrganism.key },
        headers: createAuthorizationHeader(token),
    });

    if (response.isErr()) {
        throw new Error(`Unexpected error while approving: ${JSON.stringify(response.error)}`);
    }
};

export const revokeReleasedData = async (accessions: Accession[], token: string): Promise<AccessionVersion[]> => {
    const body = {
        accessions,
    };

    const responseResult = await backendClient.call('revokeSequences', body, {
        params: { organism: dummyOrganism.key },
        headers: createAuthorizationHeader(token),
    });

    const accessionVersions = responseResult.match(
        (accessionVersions) => accessionVersions,
        (error) => {
            throw new Error(`Unexpected error while revoking: ${JSON.stringify(error)}`);
        },
    );

    const confirmationResponse = await backendClient.call(
        'confirmRevocation',
        { accessionVersions },
        {
            params: { organism: dummyOrganism.key },
            headers: createAuthorizationHeader(token),
        },
    );

    if (confirmationResponse.isErr()) {
        throw new Error(`Unexpected error while confirming revocation: ${JSON.stringify(confirmationResponse.error)}`);
    }

    return accessionVersions;
};

export const deleteAllSequencesForUser = async (token: string) => {
    const body = {
        scope: deleteAllDataScope.value,
    };

    const response = await backendClient.call('deleteSequences', body, {
        params: { organism: dummyOrganism.key },
        headers: createAuthorizationHeader(token),
    });

    if (response.isErr()) {
        throw new Error(`Unexpected error while deleting: ${JSON.stringify(response.error)}`);
    }
};

export const createGroup = async (newGroupName: string = DEFAULT_GROUP_NAME, token: string) => {
    await groupManagementClient.zodios.createGroup(
        { groupName: newGroupName },
        {
            headers: createAuthorizationHeader(token),
        },
    );
};
