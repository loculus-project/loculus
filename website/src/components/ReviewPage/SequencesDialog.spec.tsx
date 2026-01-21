import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { SequencesDialog } from './SequencesDialog.tsx';
import { processedStatus, type SequenceEntryToEdit } from '../../types/backend.ts';
import {
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';

describe('SequencesDialog', () => {
    test('should only show existing sequences', async () => {
        const { getByText, queryByText, getByRole } = render(
            <SequencesDialog
                isOpen={true}
                onClose={() => undefined}
                dataToView={dataToView('L', 'S', gene1, gene2)}
                referenceGenomesInfo={MULTI_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        await waitFor(() => {
            expect(getByText('ATTTGCC')).toBeVisible();
        });

        await userEvent.click(getByRole('button', { name: `L (aligned)` }));
        await waitFor(() => {
            expect(getByText('A-T-T-T-G-C-C')).toBeVisible();
        });

        await userEvent.click(getByRole('button', { name: `L (unaligned)` }));
        await waitFor(() => {
            expect(getByText('ATTTGCC')).toBeVisible();
        });

        await userEvent.click(getByRole('button', { name: `${gene1}` }));
        await waitFor(() => {
            expect(getByText('MADS*')).toBeVisible();
        });

        expect(queryByText(new RegExp('S (unaligned)'))).not.toBeInTheDocument();
        expect(queryByText(new RegExp(gene2))).not.toBeInTheDocument();
    });

    test('should show mapped segment names', async () => {
        const { getByRole } = render(
            <SequencesDialog
                isOpen={true}
                onClose={() => undefined}
                dataToView={dataToView('ref1', 'ref2', 'gene1-ref1', 'gene2-ref2')}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
            />,
        );

        await waitFor(() => {
            expect(getByRole('button', { name: `Sequence` })).toBeVisible();
            expect(getByRole('button', { name: `Aligned` })).toBeVisible();
            expect(getByRole('button', { name: `${gene1}` })).toBeVisible();
        });
    });
});

const gene1 = 'gene1';
const gene2 = 'gene2';

const dataToView = (sequence1: string, sequence2: string, gene1: string, gene2: string): SequenceEntryToEdit => {
    return {
        submissionId: 'test',
        accession: 'test',
        version: 0,
        groupId: 0,
        originalData: {
            metadata: {},
            unalignedNucleotideSequences: {},
            files: null,
        },
        processedData: {
            metadata: {},
            unalignedNucleotideSequences: {
                [sequence1]: 'ATTTGCC',
                [sequence2]: null,
            },
            alignedNucleotideSequences: {
                [sequence1]: 'A-T-T-T-G-C-C',
                [sequence2]: null,
            },
            alignedAminoAcidSequences: {
                [gene1]: 'MADS*',
                [gene2]: null,
            },
            nucleotideInsertions: {},
            aminoAcidInsertions: {},
            sequenceNameToFastaId: {
                [sequence1]: 'header1',
                [sequence2]: 'header2',
            },
            files: null,
        },
        status: processedStatus,
        errors: null,
        warnings: null,
    };
};
