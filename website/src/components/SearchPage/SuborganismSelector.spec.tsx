import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SuborganismSelector } from './SuborganismSelector';
import { type ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes';
import { MetadataFilterSchema } from '../../utils/search.ts';

const suborganismIdentifierField = 'genotype';

const filterSchema = new MetadataFilterSchema([
    {
        name: suborganismIdentifierField,
        displayName: 'My Genotype',
        type: 'string',
    },
]);

const mockReferenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema = {
    segments: {
        main: {
            references: ['suborganism1', 'suborganism2'],
            insdcAccessions: {},
            genesByReference: {},
        },
    },
};

const singleReferenceSchema: ReferenceGenomesLightweightSchema = {
    segments: {
        main: {
            references: ['single'],
            insdcAccessions: {},
            genesByReference: {},
        },
    },
};

describe('SuborganismSelector', () => {
    it('renders nothing in single pathogen case', () => {
        const { container } = render(
            <SuborganismSelector
                filterSchema={filterSchema}
                referenceGenomeLightweightSchema={singleReferenceSchema}
                suborganismIdentifierField={suborganismIdentifierField}
                selectedSuborganism={null}
                setSelectedSuborganism={vi.fn()}
            />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('renders selector UI in multi-pathogen case', () => {
        const setSelected = vi.fn();
        render(
            <SuborganismSelector
                filterSchema={filterSchema}
                referenceGenomeLightweightSchema={mockReferenceGenomeLightweightSchema}
                suborganismIdentifierField={suborganismIdentifierField}
                selectedSuborganism={null}
                setSelectedSuborganism={setSelected}
            />,
        );

        expect(screen.getByText('My Genotype')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')).toHaveLength(3); // Includes disabled option
    });

    it('updates selection when changed', async () => {
        const setSelected = vi.fn();
        render(
            <SuborganismSelector
                filterSchema={filterSchema}
                referenceGenomeLightweightSchema={mockReferenceGenomeLightweightSchema}
                suborganismIdentifierField={suborganismIdentifierField}
                selectedSuborganism={null}
                setSelectedSuborganism={setSelected}
            />,
        );

        await userEvent.selectOptions(screen.getByRole('combobox'), 'suborganism1');
        expect(setSelected).toHaveBeenCalledWith('suborganism1');
    });

    it('shows clear button and clears selection', async () => {
        const setSelected = vi.fn();
        render(
            <SuborganismSelector
                filterSchema={filterSchema}
                referenceGenomeLightweightSchema={mockReferenceGenomeLightweightSchema}
                suborganismIdentifierField={suborganismIdentifierField}
                selectedSuborganism='Pathogen 1'
                setSelectedSuborganism={setSelected}
            />,
        );

        await userEvent.click(screen.getByRole('button'));
        expect(setSelected).toHaveBeenCalledWith(null);
    });

    it('throws error when suborganism field is not in config', () => {
        expect(() =>
            render(
                <SuborganismSelector
                    filterSchema={new MetadataFilterSchema([])}
                    referenceGenomeLightweightSchema={mockReferenceGenomeLightweightSchema}
                    suborganismIdentifierField={suborganismIdentifierField}
                    selectedSuborganism={null}
                    setSelectedSuborganism={vi.fn()}
                />,
            ),
        ).toThrow('Cannot render suborganism selector');
    });
});
