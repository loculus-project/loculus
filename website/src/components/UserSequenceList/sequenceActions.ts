import { ok, type Result } from 'neverthrow';

import { ClientSideBackendClient } from '../../services/clientSideBackendClient.ts';
import { type ClientConfig, type SequenceStatus, type SequenceVersion } from '../../types.ts';
import { getSequenceVersionString } from '../../utils/extractSequenceVersion.ts';

export type BulkSequenceAction = {
    name: string;
    actionOnSequences: (
        selectedSequences: SequenceStatus[],
        clientConfig: ClientConfig,
        username: string,
    ) => Promise<Result<never, string>>;
    confirmationDialog?: {
        message: (selectedSequences: SequenceVersion[]) => string;
    };
};

const deleteAction: BulkSequenceAction = {
    name: 'delete',
    actionOnSequences: async (selectedSequences, clientConfig, username) =>
        ClientSideBackendClient.create(clientConfig).deleteSequences(username, selectedSequences),
    confirmationDialog: {
        message: (selectedSequences) =>
            `Are you sure you want to delete the selected sequence ${pluralizeWord(
                'version',
                selectedSequences.length,
            )} ${sequenceVersionsToString(selectedSequences)}?`,
    },
};

const approveAction: BulkSequenceAction = {
    name: 'approve',
    actionOnSequences: async (
        selectedSequences: SequenceStatus[],
        clientConfig: ClientConfig,
        username: string,
    ): Promise<Result<never, string>> => {
        return ClientSideBackendClient.create(clientConfig).approveProcessedData(username, selectedSequences);
    },
    confirmationDialog: {
        message: (selectedSequences) =>
            `Are you sure you want to approve the selected sequence ${pluralizeWord(
                'version',
                selectedSequences.length,
            )} ${sequenceVersionsToString(selectedSequences)}?`,
    },
};

const confirmRevocationAction: BulkSequenceAction = {
    name: 'confirmRevocation',
    actionOnSequences: async (selectedSequences, clientConfig, username) =>
        ClientSideBackendClient.create(clientConfig).confirmRevocation(username, selectedSequences),
};

const revokeAction: BulkSequenceAction = {
    name: 'revoke',
    actionOnSequences: async (selectedSequences, clientConfig, username) => {
        return ClientSideBackendClient.create(clientConfig).revokeSequences(username, selectedSequences);
    },
    confirmationDialog: {
        message: (selectedSequences) =>
            `Are you sure you want to revoke the selected sequence ${pluralizeWord(
                'version',
                selectedSequences.length,
            )} ${sequenceVersionsToString(selectedSequences)}?`,
    },
};

export const bulkSequenceActions = {
    delete: deleteAction,
    approve: approveAction,
    revoke: revokeAction,
    confirmRevocation: confirmRevocationAction,
} as const;

export type BulkSequenceActionName = keyof typeof bulkSequenceActions;

export type SingleSequenceAction = {
    name: string;
    tableHeader: string;
    actionOnSequence: (
        selectedSequence: SequenceStatus,
        clientConfig: ClientConfig,
        username: string,
    ) => Promise<Result<never, string>>;
};
export type SingleSequenceActionName = keyof typeof singleSequenceActions;

const reviewAction: SingleSequenceAction = {
    name: 'review',
    tableHeader: 'Link to Review',
    actionOnSequence: async (selectedSequence: SequenceStatus, _clientConfig: ClientConfig, username: string) => {
        window.location.href = `/user/${username}/review/${selectedSequence.sequenceId}/${selectedSequence.version}`;
        return ok(undefined as never);
    },
};
export const singleSequenceActions = {
    review: reviewAction,
} as const;

const pluralizeWord = (word: string, count: number) => (count === 1 ? word : `${word}s`);

const maxSequencesToDisplayInConfirmationDialog = 10;

const sequenceVersionsToString = (
    sequenceVersions: SequenceVersion[],
    maxSequencesToDisplay: number = maxSequencesToDisplayInConfirmationDialog,
) =>
    sequenceVersions
        .slice(0, maxSequencesToDisplay)
        .sort((a, b) => a.sequenceId - b.sequenceId)
        .map(getSequenceVersionString)
        .join(', ') + (sequenceVersions.length > maxSequencesToDisplay ? ', ...' : '');
