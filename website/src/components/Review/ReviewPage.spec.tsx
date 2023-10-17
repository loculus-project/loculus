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
            originalUnalignedNucleotideSequencesField: 'originalUnalignedNucleotideSequencesValue',
        },
    },
    processedData: {
        metadata: {
            processedMetaDataField: 'processedMetaDataValue',
        },
        unalignedNucleotideSequences: {
            processedUnalignedNucleotideSequencesField: 'processedUnalignedNucleotideSequencesValue',
        },
    },
};

const dummyConfig = {} as ClientConfig;
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

        expectTextInMetadata.original(defaultReviewData.originalData.metadata);

        expect(screen.getByText(/Processed Data/i)).toBeInTheDocument();

        expectTextInMetadata.processed(defaultReviewData.processedData.metadata);
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

        expectTextInMetadata.original({
            [metadataKey]: editableEntry + someTextToAdd,
        });
        const undoButton = document.querySelector(`.tooltip[data-tip="Revert to: ${editableEntry}"]`);
        expect(undoButton).not.toBeNull();

        await userEvent.click(undoButton!);
        expectTextInMetadata.original(defaultReviewData.originalData.metadata);
    });
});

const expectTextInMetadata = {
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
