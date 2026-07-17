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
import { type SubmittedMetadataRecord } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';

const queryClient = new QueryClient();

const dummyConfig = { backendUrl: 'dummy' };
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

function renderEditPage({
    editedData = defaultReviewData,
    clientConfig = dummyConfig,
    allowSubmissionOfConsensusSequences = true,
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
});

const expectTextInSequenceData = {
    unprocessedMetadata: (metadata: SubmittedMetadataRecord): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            const label = document.querySelector(`label[for="${key}"]`);
            expect(label).toBeTruthy();
            expect(screen.getByDisplayValue(value)).toBeInTheDocument();
        }),
};
