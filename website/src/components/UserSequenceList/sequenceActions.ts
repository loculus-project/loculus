import type { ActionHooks } from './SequenceEntryTable.tsx';
import { routes } from '../../routes.ts';
import type { AccessionVersion, SequenceEntryStatus } from '../../types/backend.ts';
import { extractAccessionVersion, getAccessionVersionString } from '../../utils/extractAccessionVersion.ts';

export type BulkSequenceAction = {
    name: string;
    actionOnSequenceEntries: (selectedSequences: SequenceEntryStatus[], actionHooks: ActionHooks) => Promise<void>;
    confirmationDialog?: {
        message: (selectedSequences: AccessionVersion[]) => string;
    };
};

const deleteAction: BulkSequenceAction = {
    name: 'delete',
    actionOnSequenceEntries: async (selectedSequences, actionHooks) =>
        actionHooks.deleteSequenceEntries({ accessionVersions: selectedSequences.map(extractAccessionVersion) }),
    confirmationDialog: {
        message: (selectedSequences) =>
            `Are you sure you want to delete the selected sequence entry ${pluralizeWord(
                'version',
                selectedSequences.length,
            )} ${accessionVersionsToString(selectedSequences)}?`,
    },
};

const approveAction: BulkSequenceAction = {
    name: 'approve',
    actionOnSequenceEntries: async (selectedSequences, actionHooks) =>
        actionHooks.approveProcessedData({ accessionVersions: selectedSequences.map(extractAccessionVersion) }),
    confirmationDialog: {
        message: (selectedSequences) =>
            `Are you sure you want to approve the selected sequence entry ${pluralizeWord(
                'version',
                selectedSequences.length,
            )} ${accessionVersionsToString(selectedSequences)}?`,
    },
};

const confirmRevocationAction: BulkSequenceAction = {
    name: 'confirmRevocation',
    actionOnSequenceEntries: async (selectedSequences, actionHooks) =>
        actionHooks.confirmRevocation({ accessionVersions: selectedSequences.map(extractAccessionVersion) }),
};

const revokeAction: BulkSequenceAction = {
    name: 'revoke',
    actionOnSequenceEntries: async (selectedSequences, actionHooks) =>
        actionHooks.revokeSequenceEntries({ accessions: selectedSequences.map((sequence) => sequence.accession) }),
    confirmationDialog: {
        message: (selectedSequences) =>
            `Are you sure you want to revoke the selected sequence entry ${pluralizeWord(
                'version',
                selectedSequences.length,
            )} ${accessionVersionsToString(selectedSequences)}?`,
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
    actionOnSequenceEntry: (organism: string, selectedSequence: SequenceEntryStatus, username: string) => Promise<void>;
};
export type SingleSequenceActionName = keyof typeof singleSequenceActions;

const reviewAction: SingleSequenceAction = {
    name: 'review',
    tableHeader: 'Link to Review',
    actionOnSequenceEntry: async (organism, selectedSequence, username) => {
        window.location.href = routes.reviewPage(organism, username, selectedSequence);
    },
};
export const singleSequenceActions = {
    review: reviewAction,
} as const;

const pluralizeWord = (word: string, count: number) => (count === 1 ? word : `${word}s`);

const maxSequencesToDisplayInConfirmationDialog = 10;

const accessionVersionsToString = (
    accessionVersions: AccessionVersion[],
    maxSequencesToDisplay: number = maxSequencesToDisplayInConfirmationDialog,
) =>
    accessionVersions
        .slice(0, maxSequencesToDisplay)
        .sort((a, b) => (a.accession > b.accession ? 1 : -1))
        .map(getAccessionVersionString)
        .join(', ') + (accessionVersions.length > maxSequencesToDisplay ? ', ...' : '');
