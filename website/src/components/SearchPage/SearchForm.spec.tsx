import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import { routes } from '../../routes.ts';
import type { MetadataFilter } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

vi.mock('../../config', () => ({
    fetchAutoCompletion: vi.fn().mockResolvedValue([]),
    getLapisUrl: vi.fn().mockReturnValue('lapis.dummy.url'),
}));

const queryClient = new QueryClient();

const defaultSearchFormFilters = [
    { name: 'field1', type: 'string' as const, label: 'Field 1', autocomplete: false, filterValue: '' },
    { name: 'field2', type: 'date' as const, autocomplete: false, filterValue: '' },
    { name: 'field3', type: 'pango_lineage' as const, label: 'Field 3', autocomplete: true, filterValue: '' },
];

const defaultReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
};

function renderSearchForm(
    searchFormFilters: MetadataFilter[] = [...defaultSearchFormFilters],
    clientConfig: ClientConfig = testConfig.public,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames = defaultReferenceGenomesSequenceNames,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SearchForm
                organism={testOrganism}
                filters={searchFormFilters}
                initialMutationFilter={{}}
                clientConfig={clientConfig}
                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
            />
        </QueryClientProvider>,
    );
}

describe('SearchForm', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: {
                href: '',
            },
        });
    });

    test('should render the form with all fields that are searchable', async () => {
        renderSearchForm();

        expect(screen.getByPlaceholderText('Field 1')).toBeDefined();
        expect(screen.getByLabelText('Field2')).toBeDefined();
        expect(screen.getByLabelText('Field 3')).toBeDefined();
    });

    test('should redirect according to filters', async () => {
        renderSearchForm();

        const filterValue = 'test';
        await userEvent.type(screen.getByPlaceholderText('Field 1'), filterValue);

        const searchButton = screen.getByRole('button', { name: 'Search' });
        await userEvent.click(searchButton);

        expect(window.location.href).toBe(
            routes.searchPage(testOrganism, [{ ...defaultSearchFormFilters[0], filterValue }]),
        );
    });

    test('should not render the form with fields with flag notSearchable', async () => {
        renderSearchForm([
            ...defaultSearchFormFilters,
            {
                name: 'NotSearchable',
                type: 'string' as const,
                autocomplete: false,
                filterValue: '',
                notSearchable: true,
            },
        ]);

        expect(screen.getByPlaceholderText('Field 1')).toBeDefined();
        expect(screen.queryByPlaceholderText('NotSearchable')).not.toBeInTheDocument();
    });
});
