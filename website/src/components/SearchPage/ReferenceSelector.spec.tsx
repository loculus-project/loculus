import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReferenceSelector } from './ReferenceSelector.tsx';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';
import { MetadataFilterSchema } from '../../utils/search.ts';

const referenceIdentifierField = 'genotype';

const filterSchema = new MetadataFilterSchema([
    {
        name: referenceIdentifierField,
        displayName: 'My Genotype',
        type: 'string',
    },
]);

const multiSegmentFilterSchema = new MetadataFilterSchema([
    {
        name: `${referenceIdentifierField}_L`,
        displayName: 'My Genotype L',
        type: 'string',
    },
    {
        name: `${referenceIdentifierField}_S`,
        displayName: 'My Genotype S',
        type: 'string',
    },
]);

describe('ReferenceSelector', () => {
    it('renders nothing in single reference case', () => {
        const { container } = render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={vi.fn()}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('renders selector UI in multi-reference case', () => {
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={setSelected}
            />,
        );

        expect(screen.getByText('My Genotype')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3); // Includes disabled option
    });

    it('renders selector UI in multi-segment multi-reference case', () => {
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={multiSegmentFilterSchema}
                referenceGenomesInfo={MULTI_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={setSelected}
            />,
        );

        expect(screen.getByText('My Genotype L')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3); // Includes disabled option
    });

    it('updates selection when changed', async () => {
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: null }}
                setSelectedReferences={setSelected}
            />,
        );

        await userEvent.selectOptions(screen.getByRole('combobox'), 'ref1');
        expect(setSelected).toHaveBeenCalledWith({ main: 'ref1' });
    });

    it('shows clear button and clears selection', async () => {
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: 'ref1' }}
                setSelectedReferences={setSelected}
            />,
        );

        await userEvent.click(screen.getByRole('button'));
        expect(setSelected).toHaveBeenCalledWith({ main: null });
    });
});
