import type { ActionHooks } from './SequenceTable.tsx';
import { routes } from '../../routes.ts';
import type { SequenceStatus, SequenceVersion } from '../../types/backend.ts';
import { extractSequenceVersion, getSequenceVersionString } from '../../utils/extractSequenceVersion.ts';

export type BulkSequenceAction = {
    name: string;
    actionOnSequences: (selectedSequences: SequenceStatus[], actionHooks: ActionHooks) => Promise<void>;
    confirmationDialog?: {
        message: (selectedSequences: SequenceVersion[]) => string;
    };
};

const deleteAction: BulkSequenceAction = {
    name: 'delete',
    actionOnSequences: async (selectedSequences, actionHooks) =>
        actionHooks.deleteSequences({ sequenceVersions: selectedSequences.map(extractSequenceVersion) }),
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
    actionOnSequences: async (selectedSequences, actionHooks) =>
        actionHooks.approveProcessedData({ sequenceVersions: selectedSequences.map(extractSequenceVersion) }),
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
    actionOnSequences: async (selectedSequences, actionHooks) =>
        actionHooks.confirmRevocation({ sequenceVersions: selectedSequences.map(extractSequenceVersion) }),
};

const revokeAction: BulkSequenceAction = {
    name: 'revoke',
    actionOnSequences: async (selectedSequences, actionHooks) =>
        actionHooks.revokeSequences({ sequenceIds: selectedSequences.map((sequence) => sequence.sequenceId) }),
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
    actionOnSequence: (selectedSequence: SequenceStatus, username: string) => Promise<void>;
};
export type SingleSequenceActionName = keyof typeof singleSequenceActions;

const reviewAction: SingleSequenceAction = {
    name: 'review',
    tableHeader: 'Link to Review',
    actionOnSequence: async (selectedSequence: SequenceStatus, username: string) => {
        window.location.href = routes.reviewPage(username, selectedSequence);
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
        .sort((a, b) => (a.sequenceId > b.sequenceId ? 1 : -1))
        .map(getSequenceVersionString)
        .join(', ') + (sequenceVersions.length > maxSequencesToDisplay ? ', ...' : '');
