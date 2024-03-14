import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sentenceCase } from 'change-case';
import { beforeEach, describe, expect, test } from 'vitest';

import { EditPage } from './EditPage.tsx';
import { defaultReviewData, editableEntry, metadataKey, testAccessToken, testOrganism } from '../../../vitest.setup.ts';
import type { MetadataField, SequenceEntryToEdit, UnprocessedMetadataRecord } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

const queryClient = new QueryClient();

const dummyConfig = { backendUrl: 'dummy' } as ClientConfig;

function renderEditPage(editedData: SequenceEntryToEdit = defaultReviewData, clientConfig: ClientConfig = dummyConfig) {
    render(
        <QueryClientProvider client={queryClient}>
            <EditPage
                organism={testOrganism}
                dataToEdit={editedData}
                clientConfig={clientConfig}
                accessToken={testAccessToken}
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

        const submitButton = screen.getByRole('button', { name: /Submit/i });
        expect(submitButton).toBeInTheDocument();

        // jsdom cannot do HTMLDialogElements: https://github.com/testing-library/react-testing-library/issues/1106
        // await userEvent.click(submitButton);
    });

    test('should show original data and processed data', async () => {
        renderEditPage();

        expect(screen.getByText(/Original Data/i)).toBeInTheDocument();
        expectTextInSequenceData.originalMetadata(defaultReviewData.originalData.metadata);

        expect(screen.getAllByText(/Unaligned nucleotide sequences/i)[0]).toBeInTheDocument();
        expectTextInSequenceData.original(defaultReviewData.originalData.unalignedNucleotideSequences);

        expect(screen.getByText(/Processed Data/i)).toBeInTheDocument();
        expectTextInSequenceData.processedMetadata(defaultReviewData.processedData.metadata);
        expectTextInSequenceData.processed(defaultReviewData.processedData.unalignedNucleotideSequences);

        expect(screen.getByText(/^Aligned nucleotide sequences/i)).toBeInTheDocument();
        expectTextInSequenceData.processed(defaultReviewData.processedData.alignedNucleotideSequences);

        expect(screen.getByText(/Amino acid sequences/i)).toBeInTheDocument();
        expectTextInSequenceData.processed(defaultReviewData.processedData.alignedAminoAcidSequences);

        expect(screen.getByText('processedInsertionSequenceName:')).toBeInTheDocument();
        expect(screen.getByText('nucleotideInsertion1,nucleotideInsertion2')).toBeInTheDocument();

        expect(screen.getByText('processedInsertionGeneName:')).toBeInTheDocument();
        expect(screen.getByText('aminoAcidInsertion1,aminoAcidInsertion2')).toBeInTheDocument();
    });

    test('should show error and warning tooltips', async () => {
        renderEditPage();

        expect(document.querySelector('.tooltip[data-tip="errorMessage"]')).toBeTruthy();
        expect(document.querySelector('.tooltip[data-tip="warningMessage"]')).toBeTruthy();
    });

    test('should edit, show errors and undo input', async () => {
        renderEditPage();

        await userEvent.click(screen.getByDisplayValue(editableEntry));

        expect(screen.getByText(/errorMessage/i)).toBeInTheDocument();
        expect(screen.getByText(/warningMessage/i)).toBeInTheDocument();

        const someTextToAdd = '_addedText';
        await userEvent.type(screen.getByDisplayValue(editableEntry), someTextToAdd);

        expectTextInSequenceData.originalMetadata({
            [metadataKey]: editableEntry + someTextToAdd,
        });
        const undoButton = document.querySelector(`.tooltip[data-tip="Revert to: ${editableEntry}"]`);
        expect(undoButton).not.toBeNull();

        await userEvent.click(undoButton!);
        expectTextInSequenceData.originalMetadata(defaultReviewData.originalData.metadata);
    });
});

const expectTextInSequenceData = {
    original: (metadata: Record<string, string>): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            expect(screen.getByText(key + ':')).toBeInTheDocument();
            expect(screen.getByDisplayValue(value)).toBeInTheDocument();
        }),
    originalMetadata: (metadata: UnprocessedMetadataRecord): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            expect(screen.getByText(sentenceCase(key) + ':')).toBeInTheDocument();
            expect(screen.getByDisplayValue(value)).toBeInTheDocument();
        }),
    processed: (metadata: Record<string, string | null>): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            expect(screen.getByText(key + ':')).toBeInTheDocument();
            expect(screen.getByText(value ?? 'null')).toBeInTheDocument();
        }),
    processedMetadata: (metadata: Record<string, MetadataField>): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            expect(screen.getByText(sentenceCase(key) + ':')).toBeInTheDocument();
            expect(screen.getByText((value ?? 'null').toString())).toBeInTheDocument();
        }),
};
