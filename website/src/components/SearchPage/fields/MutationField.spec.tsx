import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { MutationField } from './MutationField.tsx';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../../types/referencesGenomes.ts';

const singleAccession: ReferenceAccession = {
    name: 'main',
    insdcAccessionFull: 'accession_main',
};

const singleSegmentedReferenceGenome: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
    insdcAccessionFull: [singleAccession],
};

const multiAccession1: ReferenceAccession = {
    name: 'seg1',
    insdcAccessionFull: 'accession_seg1',
};

const multiAccession2: ReferenceAccession = {
    name: 'seg2',
    insdcAccessionFull: 'accession_seg2',
};

const multiSegmentedReferenceGenome: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['seg1', 'seg2'],
    genes: ['gene1', 'gene2'],
    insdcAccessionFull: [multiAccession1, multiAccession2],
};

function renderField(
    value: string,
    onChange: (mutationFilter: string) => void,
    referenceGenome: ReferenceGenomesSequenceNames,
) {
    render(<MutationField value={value} onChange={onChange} referenceGenomesSequenceNames={referenceGenome} />);
}

describe('MutationField', () => {
    test('should render provided value', () => {
        const handleChange = vi.fn();
        renderField('gene1:10Y, A20T, ins_30:G?G', handleChange, singleSegmentedReferenceGenome);
        expect(screen.queryByText('gene1:10Y')).toBeInTheDocument();
        expect(screen.queryByText('A20T')).toBeInTheDocument();
        expect(screen.queryByText('ins_30:G?G')).toBeInTheDocument();
    });

    test('should accept input and dispatch events (single-segmented)', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, singleSegmentedReferenceGenome);

        await userEvent.type(screen.getByLabelText('Mutations'), 'G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith('G100A');
    });

    test('should accept input and dispatch events (multi-segmented)', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, multiSegmentedReferenceGenome);

        await userEvent.type(screen.getByLabelText('Mutations'), 'seg1:G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith('seg1:G100A');
    });

    test('should reject invalid input', async () => {
        const handleChange = vi.fn();
        renderField('', handleChange, singleSegmentedReferenceGenome);

        await userEvent.type(screen.getByLabelText('Mutations'), 'main:G200A{enter}');
        expect(handleChange).toHaveBeenCalledTimes(0);
    });
});
