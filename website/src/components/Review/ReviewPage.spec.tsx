import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sentenceCase } from 'change-case';
import { beforeEach, describe, expect, test } from 'vitest';

import { ReviewPage } from './ReviewPage.tsx';
import { testuser } from '../../../tests/e2e.fixture.ts';
import type { ClientConfig, MetadataField, SequenceReview } from '../../types';

const queryClient = new QueryClient();
const metadataKey = 'originalMetaDataField';
const editableEntry = 'originalMetaDataValue';
const defaultReviewData: SequenceReview = {
    sequenceId: 1,
    version: 1,
    status: 'NEEDS_REVIEW',
    errors: [
        {
            source: [
                {
                    name: metadataKey,
                    type: 'Metadata',
                },
            ],
            message: 'errorMessage',
        },
    ],
    warnings: [
        {
            source: [
                {
                    name: metadataKey,
                    type: 'Metadata',
                },
            ],
            message: 'warningMessage',
        },
    ],
    originalData: {
        metadata: {
            [metadataKey]: editableEntry,
        },
        unalignedNucleotideSequences: {
            originalSequenceName: 'originalUnalignedNucleotideSequencesValue',
        },
    },
    processedData: {
        metadata: {
            processedMetaDataField: 'processedMetaDataValue',
        },
        unalignedNucleotideSequences: {
            unalignedProcessedSequenceName: 'processedUnalignedNucleotideSequencesValue',
        },
        alignedNucleotideSequences: {
            alignedProcessedSequenceName: 'processedAlignedNucleotideSequencesValue',
        },
        nucleotideInsertions: {
            processedInsertionSequenceName: ['nucleotideInsertion1', 'nucleotideInsertion2'],
        },
        aminoAcidSequences: {
            alignedProcessedGeneName: 'processedAminoAcidSequencesValue',
        },
        aminoAcidInsertions: {
            processedInsertionGeneName: ['aminoAcidInsertion1', 'aminoAcidInsertion2'],
        },
    },
};

const dummyConfig = { backendUrl: 'dummy' } as ClientConfig;

function renderReviewPage(reviewData: SequenceReview = defaultReviewData, clientConfig: ClientConfig = dummyConfig) {
    render(
        <QueryClientProvider client={queryClient}>
            <ReviewPage reviewData={reviewData} clientConfig={clientConfig} username={testuser} />
        </QueryClientProvider>,
    );
}

describe('ReviewPage', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: {
                href: '',
            },
        });
    });

    test('should render the form with submit button', async () => {
        renderReviewPage();

        const submitButton = screen.getByRole('button', { name: /Submit Review/i });
        expect(submitButton).toBeInTheDocument();

        // jsdom cannot do HTMLDialogElements: https://github.com/testing-library/react-testing-library/issues/1106
        // await userEvent.click(submitButton);
    });

    test('should show original data and processed data', async () => {
        renderReviewPage();

        expect(screen.getByText(/Original Data/i)).toBeInTheDocument();
        expectTextInSequenceData.original(defaultReviewData.originalData.metadata);

        expect(screen.getAllByText(/Unaligned nucleotide sequences/i)[0]).toBeInTheDocument();
        expectTextInSequenceData.original(defaultReviewData.originalData.unalignedNucleotideSequences);

        expect(screen.getByText(/Processed Data/i)).toBeInTheDocument();
        expectTextInSequenceData.processed(defaultReviewData.processedData.metadata);
        expectTextInSequenceData.processed(defaultReviewData.processedData.unalignedNucleotideSequences);

        expect(screen.getByText(/^Aligned nucleotide sequences/i)).toBeInTheDocument();
        expectTextInSequenceData.processed(defaultReviewData.processedData.alignedNucleotideSequences);

        expect(screen.getByText(/Amino acid sequences/i)).toBeInTheDocument();
        expectTextInSequenceData.processed(defaultReviewData.processedData.aminoAcidSequences);

        expect(screen.getByText('Processed insertion sequence name:')).toBeInTheDocument();
        expect(screen.getByText('nucleotideInsertion1,nucleotideInsertion2')).toBeInTheDocument();

        expect(screen.getByText('Processed insertion gene name:')).toBeInTheDocument();
        expect(screen.getByText('aminoAcidInsertion1,aminoAcidInsertion2')).toBeInTheDocument();
    });

    test('should show error and warning tooltips', async () => {
        renderReviewPage();

        expect(document.querySelector('.tooltip[data-tip="errorMessage"]')).toBeTruthy();
        expect(document.querySelector('.tooltip[data-tip="warningMessage"]')).toBeTruthy();
    });

    test('should edit, show errors and undo input', async () => {
        renderReviewPage();

        await userEvent.click(screen.getByDisplayValue(editableEntry));

        expect(screen.getByText(/errorMessage/i)).toBeInTheDocument();
        expect(screen.getByText(/warningMessage/i)).toBeInTheDocument();

        const someTextToAdd = '_addedText';
        await userEvent.type(screen.getByDisplayValue(editableEntry), someTextToAdd);

        expectTextInSequenceData.original({
            [metadataKey]: editableEntry + someTextToAdd,
        });
        const undoButton = document.querySelector(`.tooltip[data-tip="Revert to: ${editableEntry}"]`);
        expect(undoButton).not.toBeNull();

        await userEvent.click(undoButton!);
        expectTextInSequenceData.original(defaultReviewData.originalData.metadata);
    });
});

const expectTextInSequenceData = {
    original: (metadata: Record<string, MetadataField>): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            expect(screen.getByText(sentenceCase(key) + ':')).toBeInTheDocument();
            expect(screen.getByDisplayValue(value.toString())).toBeInTheDocument();
        }),
    processed: (metadata: Record<string, MetadataField>): void =>
        Object.entries(metadata).forEach(([key, value]) => {
            expect(screen.getByText(sentenceCase(key) + ':')).toBeInTheDocument();
            expect(screen.getByText(value.toString())).toBeInTheDocument();
        }),
};
