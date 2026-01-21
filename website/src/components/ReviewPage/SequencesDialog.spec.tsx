import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { SequencesDialog } from './SequencesDialog.tsx';
import { processedStatus, type SequenceEntryToEdit } from '../../types/backend.ts';
import { SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES } from '../../types/referenceGenomesInfo.spec.ts';

describe('SequencesDialog', () => {
    test('should only show existing sequences', async () => {
        const { getByText, queryByText, getByRole } = render(
            <SequencesDialog
                isOpen={true}
                onClose={() => undefined}
                dataToView={dataToView}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        await waitFor(() => {
            expect(getByText('ATTTGCC')).toBeVisible();
        });

        await userEvent.click(getByRole('button', { name: `${sequence1} (aligned)` }));
        await waitFor(() => {
            expect(getByText('A-T-T-T-G-C-C')).toBeVisible();
        });

        await userEvent.click(getByRole('button', { name: `${sequence1} (unaligned)` }));
        await waitFor(() => {
            expect(getByText('ATTTGCC')).toBeVisible();
        });

        await userEvent.click(getByRole('button', { name: `gene1` }));
        await waitFor(() => {
            expect(getByText('MADS*')).toBeVisible();
        });

        expect(queryByText(new RegExp(sequence2))).not.toBeInTheDocument();
        expect(queryByText(new RegExp(gene2))).not.toBeInTheDocument();
    });

    test('should show mapped segment names', async () => {
        const { getByRole } = render(
            <SequencesDialog
                isOpen={true}
                onClose={() => undefined}
                dataToView={dataToView}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
            />,
        );

        await waitFor(() => {
            expect(getByRole('button', { name: `mappedName1 (aligned)` })).toBeVisible();
            expect(getByRole('button', { name: `mappedName1 (unaligned)` })).toBeVisible();
            expect(getByRole('button', { name: 'mappedGeneName1' })).toBeVisible();
        });
    });
});

const sequence1 = 'sequence1';
const sequence2 = 'sequence2';
const gene1 = 'gene1';
const gene2 = 'gene2';

const dataToView: SequenceEntryToEdit = {
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
