import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReferenceSelector } from './ReferenceSelector.tsx';
import { MetadataFilterSchema } from '../../utils/search.ts';
import {
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';

const referenceIdentifierField = 'genotype';

const filterSchema = new MetadataFilterSchema([
    {
        name: referenceIdentifierField,
        displayName: 'My Genotype',
        type: 'string',
    },
]);

describe('ReferenceSelector', () => {
    it('renders nothing in single pathogen case', () => {
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

    it('renders selector UI in multi-pathogen case', () => {
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

        await userEvent.selectOptions(screen.getByRole('combobox'), 'suborganism1');
        expect(setSelected).toHaveBeenCalledWith({ main: 'suborganism1' });
    });

    it('shows clear button and clears selection', async () => {
        const setSelected = vi.fn();
        render(
            <ReferenceSelector
                filterSchema={filterSchema}
                referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                referenceIdentifierField={referenceIdentifierField}
                selectedReferences={{ main: 'Pathogen 1' }}
                setSelectedReferences={setSelected}
            />,
        );

        await userEvent.click(screen.getByRole('button'));
        expect(setSelected).toHaveBeenCalledWith({ main: null });
    });

    it('throws error when suborganism field is not in config', () => {
        expect(() =>
            render(
                <ReferenceSelector
                    filterSchema={new MetadataFilterSchema([])}
                    referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                    referenceIdentifierField={referenceIdentifierField}
                    selectedReferences={{ main: null }}
                    setSelectedReferences={vi.fn()}
                />,
            ),
        ).toThrow('Cannot render suborganism selector');
    });
});
