/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-empty-function */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import type { MetadataFilter } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../types/referencesGenomes.ts';

global.ResizeObserver = class FakeResizeObserver {
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
        label: 'Field 1',
        initiallyVisible: true,
    },
    {
        name: 'field3',
        type: 'pangoLineage',
        label: 'Field 3',
        autocomplete: true,
        initiallyVisible: true,
    },
];

const defaultAccession: ReferenceAccession = {
    name: 'main',
    insdcAccessionFull: undefined,
};

const defaultReferenceGenomesSequenceNames: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
    insdcAccessionFull: [defaultAccession],
};

const searchVisibilities = new Map<string, boolean>([
    ['field1', true],
    ['field3', true],
]);

const setAFieldValue = vi.fn();
const setASearchVisibility = vi.fn();

const renderSearchForm = ({
    consolidatedMetadataSchema = [...defaultSearchFormFilters],
    fieldValues = {},
    referenceGenomesSequenceNames = defaultReferenceGenomesSequenceNames,
    lapisSearchParameters = {},
} = {}) => {
    const props = {
        organism: testOrganism,
        consolidatedMetadataSchema,
        clientConfig: testConfig.public,
        fieldValues,
        setAFieldValue,
        lapisUrl: 'http://lapis.dummy.url',
        searchVisibilities,
        setASearchVisibility,
        referenceGenomesSequenceNames,
        lapisSearchParameters,
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
        expect(screen.getByText('Field 3')).toBeInTheDocument();
    });

    it('handles field value changes', async () => {
        renderSearchForm();

        const field1Input = await screen.findByLabelText('Field 1');
        fireEvent.change(field1Input, { target: { value: '2023-01-01' } });

        expect(setAFieldValue).toHaveBeenCalledWith('field1', '2023-01-01');
    });

    it('resets the form fields', async () => {
        renderSearchForm();

        const resetButton = screen.getByText('Reset');
        await userEvent.click(resetButton);
        expect(window.location.href).toMatch(/\/$/);
    });
});
