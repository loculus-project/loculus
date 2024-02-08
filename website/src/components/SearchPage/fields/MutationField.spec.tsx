import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { MutationField } from './MutationField.tsx';
import type { MutationFilter } from '../../../types/config.ts';
import type { referenceGenomeSequenceNames } from '../../../types/referencesGenomes.ts';

const singleSegmentedReferenceGenome: referenceGenomeSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
};

const multiSegmentedReferenceGenome: referenceGenomeSequenceNames = {
    nucleotideSequences: ['seg1', 'seg2'],
    genes: ['gene1', 'gene2'],
};

function renderField(
    value: MutationFilter,
    onChange: (mutationFilter: MutationFilter) => void,
    referenceGenome: referenceGenomeSequenceNames,
) {
    render(<MutationField value={value} onChange={onChange} referenceGenome={referenceGenome} />);
}

describe('MutationField', () => {
    test('should render provided value', async () => {
        const handleChange = vi.fn();
        renderField(
            {
                aminoAcidMutationQueries: ['gene1:10Y'],
                nucleotideMutationQueries: ['A20T'],
                nucleotideInsertionQueries: ['ins_30:G?G'],
            },
            handleChange,
            singleSegmentedReferenceGenome,
        );
        expect(screen.queryByText('gene1:10Y')).toBeInTheDocument();
        expect(screen.queryByText('A20T')).toBeInTheDocument();
        expect(screen.queryByText('ins_30:G?G')).toBeInTheDocument();
    });

    test('should accept input and dispatch events (single-segmented)', async () => {
        const handleChange = vi.fn();
        renderField({}, handleChange, singleSegmentedReferenceGenome);

        await userEvent.type(screen.getByLabelText('Mutations'), 'G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith({
            nucleotideMutationQueries: ['G100A'],
            aminoAcidMutationQueries: [],
            nucleotideInsertionQueries: [],
            aminoAcidInsertionQueries: [],
        });
    });

    test('should accept input and dispatch events (multi-segmented)', async () => {
        const handleChange = vi.fn();
        renderField({}, handleChange, multiSegmentedReferenceGenome);

        await userEvent.type(screen.getByLabelText('Mutations'), 'seg1:G100A{enter}');
        expect(handleChange).toHaveBeenCalledWith({
            nucleotideMutationQueries: ['seg1:G100A'],
            aminoAcidMutationQueries: [],
            nucleotideInsertionQueries: [],
            aminoAcidInsertionQueries: [],
        });
    });

    test('should reject invalid input', async () => {
        const handleChange = vi.fn();
        renderField({}, handleChange, singleSegmentedReferenceGenome);

        await userEvent.type(screen.getByLabelText('Mutations'), 'main:G200A{enter}');
        expect(handleChange).toHaveBeenCalledTimes(0);
    });
});
