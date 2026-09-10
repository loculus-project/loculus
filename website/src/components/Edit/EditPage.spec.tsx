import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test } from 'vitest';

import { EditPage } from './EditPage.tsx';
import {
    defaultReviewData,
    editableEntry,
    metadataDisplayName,
    metadataKey,
    testAccessToken,
    testOrganism,
} from '../../../vitest.setup.ts';
import {
    approvedForReleaseStatus,
    type SequenceEntryToEdit,
    type SubmittedMetadataRecord,
} from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SequenceEntryHistory, SequenceEntryHistoryEntry } from '../../types/lapis.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

const queryClient = new QueryClient();

const dummyConfig = { backendUrl: 'dummy' } as ClientConfig;
const groupedInputFields = new Map<string, InputField[]>([
    [
        'Header',
        [
            {
                name: metadataKey,
                displayName: metadataDisplayName,
            },
        ],
    ],
]);

const revisionData: SequenceEntryToEdit = { ...defaultReviewData, status: approvedForReleaseStatus };

const baseEntry: SequenceEntryHistoryEntry = {
    submittedAtTimestamp: '',
    accession: defaultReviewData.accession,
    version: 1,
    accessionVersion: `${defaultReviewData.accession}.1`,
    versionStatus: 'LATEST_VERSION',
    isRevocation: false,
};

const revisedHistory: SequenceEntryHistory = [
    { ...baseEntry, versionStatus: 'REVISED' },
    { ...baseEntry, accessionVersion: `${defaultReviewData.accession}.2`, version: 2 },
];

const revokedHistory: SequenceEntryHistory = [
    { ...baseEntry, versionStatus: 'REVOKED' },
    { ...baseEntry, accessionVersion: `${defaultReviewData.accession}.2`, version: 2, isRevocation: true },
];

const REVOKED_WARNING = 'The latest version of this sequence is a revocation.';
const NOT_LATEST_WARNING = 'This is not the latest version of this sequence entry.';

function renderEditPage({
    editedData = defaultReviewData,
    clientConfig = dummyConfig,
    allowSubmissionOfConsensusSequences = true,
    sequenceEntryHistory = undefined as SequenceEntryHistory | undefined,
} = {}) {
    render(
        <QueryClientProvider client={queryClient}>
            <EditPage
                organism={testOrganism}
                dataToEdit={editedData}
                clientConfig={clientConfig}
                accessToken={testAccessToken}
                groupedInputFields={groupedInputFields}
                submissionDataTypes={{
                    consensusSequences: allowSubmissionOfConsensusSequences,
                    maxSequencesPerEntry: 1,
                }}
                sequenceEntryHistory={sequenceEntryHistory}
                fileSharingConfig={{ disableStrictFilenameValidation: false }}
            />
        </QueryClientProvider>,
    );
}

describe('EditPage', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: {
                href: '',
            },
        });
    });

    test('should render the form with submit button', async () => {
        renderEditPage();

        const submitButton = screen.getByRole('button', { name: 'Submit edits and proceed to Approval' });
        expect(submitButton).toBeInTheDocument();

        await userEvent.click(submitButton);
    });

    test('should render without allowed submission of consensus sequences', () => {
        renderEditPage({ allowSubmissionOfConsensusSequences: false });

        expect(screen.getByText(/Original data/i)).toBeInTheDocument();
        expectTextInSequenceData.unprocessedMetadata(defaultReviewData.submittedData.metadata);
    });

    test('should show original data', () => {
        renderEditPage();

        expect(screen.getByText(/Original data/i)).toBeInTheDocument();
        expectTextInSequenceData.unprocessedMetadata(defaultReviewData.submittedData.metadata);
    });

    test('should show error and warning tooltips', () => {
        renderEditPage();

        expect(document.querySelector('[data-tooltip-content="errorMessage"]')).toBeTruthy();
        expect(document.querySelector('[data-tooltip-content="warningMessage"]')).toBeTruthy();
    });

    test('should edit, show errors and undo input', async () => {
        renderEditPage();

        await userEvent.click(screen.getByDisplayValue(editableEntry));

        expect(screen.getByText(/errorMessage/i)).toBeInTheDocument();
        expect(screen.getByText(/warningMessage/i)).toBeInTheDocument();

        const someTextToAdd = '_addedText';
        await userEvent.type(screen.getByDisplayValue(editableEntry), someTextToAdd);

        expectTextInSequenceData.unprocessedMetadata({
            [metadataKey]: editableEntry + someTextToAdd,
        });
        const undoButton = document.querySelector(`[data-tooltip-content="Revert to: ${editableEntry}"]`);
        expect(undoButton).not.toBeNull();

        await userEvent.click(undoButton!);
        expectTextInSequenceData.unprocessedMetadata(defaultReviewData.submittedData.metadata);
    });

    test('shows the revoked warning when revising an entry whose latest version is a revocation', () => {
        renderEditPage({ editedData: revisionData, sequenceEntryHistory: revokedHistory });

        expect(screen.getByText(REVOKED_WARNING)).toBeVisible();
    });

    test('shows no revoked warning when revising an entry whose latest version is not a revocation', () => {
        renderEditPage({ editedData: revisionData, sequenceEntryHistory: revisedHistory });

        expect(screen.queryByText(REVOKED_WARNING)).not.toBeInTheDocument();
    });

    test('shows the not latest version warning when revising from an earlier version', () => {
        renderEditPage({ editedData: revisionData, sequenceEntryHistory: revisedHistory });

        expect(screen.getByText(NOT_LATEST_WARNING)).toBeVisible();
        expect(screen.getByRole('link', { name: 'here' })).toBeVisible();
    });

    test('shows no not latest version warning when revising from the latest version', () => {
        renderEditPage({
            editedData: { ...revisionData, version: 2 },
            sequenceEntryHistory: revisedHistory,
        });

        expect(screen.queryByText(NOT_LATEST_WARNING)).not.toBeInTheDocument();
    });
});

const expectTextInSequenceData = {
    unprocessedMetadata: (metadata: SubmittedMetadataRecord): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            const label = document.querySelector(`label[for="${key}"]`);
            expect(label).toBeTruthy();
            expect(screen.getByDisplayValue(value)).toBeInTheDocument();
        }),
};
