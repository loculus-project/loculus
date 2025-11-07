import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import type { MetadataFilter } from '../../types/config.ts';
import {
    type ReferenceGenomesLightweightSchema,
    type ReferenceAccession,
    SINGLE_REFERENCE,
} from '../../types/referencesGenomes.ts';
import { MetadataFilterSchema } from '../../utils/search.ts';

global.ResizeObserver = class FakeResizeObserver implements ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
};

const queryClient = new QueryClient();

const defaultSearchFormFilters: MetadataFilter[] = [
    {
        name: 'field1',
        type: 'string',
        autocomplete: false,
        displayName: 'Field 1',
        initiallyVisible: true,
    },
    {
        name: 'field3',
        type: 'string',
        displayName: 'Field 3',
        autocomplete: true,
        initiallyVisible: true,
    },
];

const defaultAccession: ReferenceAccession = {
    name: 'main',
    insdcAccessionFull: undefined,
};

const defaultReferenceGenomesLightweightSchema: ReferenceGenomesLightweightSchema = {
    [SINGLE_REFERENCE]: {
        nucleotideSegmentNames: ['main'],
        geneNames: ['gene1', 'gene2'],
        insdcAccessionFull: [defaultAccession],
    },
};

const multiPathogenReferenceGenomesLightweightSchema: ReferenceGenomesLightweightSchema = {
    suborganism1: {
        nucleotideSegmentNames: ['main'],
        geneNames: ['gene1', 'gene2'],
        insdcAccessionFull: [defaultAccession],
    },
    suborganism2: {
        nucleotideSegmentNames: ['main'],
        geneNames: ['gene1', 'gene2'],
        insdcAccessionFull: [defaultAccession],
    },
};

const searchVisibilities = new Map<string, boolean>([
    ['field1', true],
    ['field3', true],
]);

const setSomeFieldValues = vi.fn();
const setASearchVisibility = vi.fn();
const setSelectedSuborganism = vi.fn();

const renderSearchForm = ({
    filterSchema = new MetadataFilterSchema([...defaultSearchFormFilters]),
    fieldValues = {},
    referenceGenomeLightweightSchema = defaultReferenceGenomesLightweightSchema,
    lapisSearchParameters = {},
    suborganismIdentifierField = undefined,
    selectedSuborganism = null,
}: {
    filterSchema?: MetadataFilterSchema;
    fieldValues?: Record<string, string>;
    referenceGenomeLightweightSchema?: ReferenceGenomesLightweightSchema;
    lapisSearchParameters?: Record<string, string>;
    suborganismIdentifierField?: string;
    selectedSuborganism?: string | null;
} = {}) => {
    const props = {
        organism: testOrganism,
        filterSchema,
        clientConfig: testConfig.public,
        fieldValues,
        setSomeFieldValues,
        lapisUrl: 'http://lapis.dummy.url',
        searchVisibilities,
        setASearchVisibility,
        referenceGenomeLightweightSchema,
        lapisSearchParameters,
        showMutationSearch: true,
        suborganismIdentifierField,
        selectedSuborganism,
        setSelectedSuborganism,
    };

    render(
        <QueryClientProvider client={queryClient}>
            <SearchForm {...props} />
        </QueryClientProvider>,
    );
};

describe('SearchForm', () => {
    it('renders without crashing', () => {
        renderSearchForm();
        expect(screen.getByText('Field 1')).toBeInTheDocument();
        // For multi-select autocomplete fields, the label is in aria-label
        expect(screen.getByLabelText('Field 3')).toBeInTheDocument();
    });

    it('handles field value changes', async () => {
        renderSearchForm();

        const field1Input = await screen.findByLabelText('Field 1');
        fireEvent.change(field1Input, { target: { value: '2023-01-01' } });

        expect(setSomeFieldValues).toHaveBeenCalledWith(['field1', '2023-01-01']);
    });

    it('resets the form fields', async () => {
        renderSearchForm();

        const resetButton = screen.getByText('Reset');
        await userEvent.click(resetButton);
        expect(window.location.href).toMatch(/\/$/);
    });

    it('should render the suborganism selector in the multi pathogen case', async () => {
        renderSearchForm({
            filterSchema: new MetadataFilterSchema([
                ...defaultSearchFormFilters,
                { name: 'My genotype', type: 'string' },
            ]),
            suborganismIdentifierField: 'My genotype',
            referenceGenomeLightweightSchema: multiPathogenReferenceGenomesLightweightSchema,
        });

        const suborganismSelector = screen.getByRole('combobox', { name: 'My genotype' });
        expect(suborganismSelector).toBeInTheDocument();
        await userEvent.selectOptions(suborganismSelector, 'suborganism1');

        expect(setSelectedSuborganism).toHaveBeenCalledWith('suborganism1');
    });

    it('opens advanced options modal with version status and revocation fields', async () => {
        renderSearchForm({
            filterSchema: new MetadataFilterSchema([
                ...defaultSearchFormFilters,
                { name: 'versionStatus', type: 'string', displayName: 'Version status' },
                { name: 'isRevocation', type: 'boolean', displayName: 'Is Revocation' },
            ]),
        });

        const advancedOptionsButton = await screen.findByRole('button', { name: 'Advanced options' });
        await userEvent.click(advancedOptionsButton);

        expect(await screen.findByLabelText('Version status')).toBeInTheDocument();
        expect(await screen.findByLabelText('Is Revocation')).toBeInTheDocument();
    });
});
