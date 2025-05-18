import { DateTime } from 'luxon';

import { createFileContent, createModifiedFileContent } from './createFileContent.ts';
import {
    type Accession,
    type AccessionVersion,
    openDataUseTermsOption,
    restrictedDataUseTermsOption,
} from '../../src/types/backend.ts';
import { createAuthorizationHeader } from '../../src/utils/createAuthorizationHeader.ts';
import { backendClient, dummyOrganism, testSequenceCount } from '../e2e.fixture.ts';

export const submitViaApi = async (
    numberOfSequenceEntries: number = testSequenceCount,
    token: string,
    groupId: number,
    restricted: boolean = false,
) => {
    const fileContent = createFileContent(numberOfSequenceEntries);

    const response = await backendClient.call(
        'submit',
        {
            metadataFile: new File([fileContent.metadataContent], 'metadata.tsv'),
            sequenceFile: new File([fileContent.sequenceFileContent], 'sequences.fasta'),
            groupId,
            dataUseTermsType: restricted ? restrictedDataUseTermsOption : openDataUseTermsOption,
            restrictedUntil: restricted ? DateTime.now().plus({ days: 1 }).toFormat('yyyy-MM-dd') : null,
        },
        {
            params: { organism: dummyOrganism.key },
            headers: createAuthorizationHeader(token),
        },
    );

    return response._unsafeUnwrap();
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

export const approveProcessedData = async (
    accessionVersions: AccessionVersion[],
    token: string,
    groupId: number,
): Promise<void> => {
    const body = {
        accessionVersionsFilter: accessionVersions,
        groupIdsFilter: [groupId],
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

export const revokeReleasedData = async (
    accessions: Accession[],
    token: string,
    groupId: number,
): Promise<AccessionVersion[]> => {
    const versionComment = 'Revoked by end-to-end test';

    const responseResult = await backendClient.call(
        'revokeSequences',
        { accessions, versionComment },
        {
            params: { organism: dummyOrganism.key },
            headers: createAuthorizationHeader(token),
        },
    );

    const accessionVersions = responseResult.match(
        (accessionVersions) => accessionVersions,
        (error) => {
            throw new Error(`Unexpected error while revoking: ${JSON.stringify(error)}`);
        },
    );

    const confirmationResponse = await backendClient.call(
        'approveProcessedData',
        {
            scope: 'ALL',
            accessionVersionsFilter: accessionVersions,
            groupIdsFilter: [groupId],
        },
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
