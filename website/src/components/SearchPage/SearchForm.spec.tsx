import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import type { MetadataFilter } from '../../types/config.ts';
import { type ReferenceGenomesMap, type ReferenceAccession } from '../../types/referencesGenomes.ts';
import { MetadataFilterSchema, MetadataVisibility } from '../../utils/search.ts';

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

const defaultReferenceGenomesMap: ReferenceGenomesMap = {
    segments: {
        main: {
            references: ['ref1'],
            insdcAccessions: { ref1: defaultAccession },
            genesByReference: { ref1: ['gene1', 'gene2'] },
        },
    },
};

const multiPathogenReferenceGenomesMap: ReferenceGenomesMap = {
    segments: {
        main: {
            references: ['suborganism1', 'suborganism2'],
            insdcAccessions: {
                suborganism1: defaultAccession,
                suborganism2: defaultAccession,
            },
            genesByReference: {
                suborganism1: ['gene1', 'gene2'],
                suborganism2: ['gene1', 'gene2'],
            },
        },
    },
};

const defaultSearchVisibilities = new Map<string, MetadataVisibility>([
    ['field1', new MetadataVisibility(true, undefined)],
    ['field3', new MetadataVisibility(true, undefined)],
]);

const setSomeFieldValues = vi.fn();
const setASearchVisibility = vi.fn();

const renderSearchForm = ({
    filterSchema = new MetadataFilterSchema([...defaultSearchFormFilters]),
    fieldValues = {},
    referenceGenomesMap = defaultReferenceGenomesMap,
    lapisSearchParameters = {},
    suborganismIdentifierField,
    selectedSuborganism = null,
    searchVisibilities = defaultSearchVisibilities,
}: {
    filterSchema?: MetadataFilterSchema;
    fieldValues?: Record<string, string>;
    referenceGenomesMap?: ReferenceGenomesMap;
    lapisSearchParameters?: Record<string, string>;
    suborganismIdentifierField?: string;
    selectedSuborganism?: string | null;
    searchVisibilities?: Map<string, MetadataVisibility>;
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
        referenceGenomesMap,
        lapisSearchParameters,
        showMutationSearch: true,
        suborganismIdentifierField,
        selectedSuborganism,
        setSelectedSuborganism: vi.fn(),
        selectedReferences: {},
    };

    render(
        <QueryClientProvider client={queryClient}>
            <SearchForm {...props} />
        </QueryClientProvider>,
    );
};

describe('SearchForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

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
        const setSelectedSuborganism = vi.fn();
        render(
            <QueryClientProvider client={queryClient}>
                <SearchForm
                    organism={testOrganism}
                    filterSchema={
                        new MetadataFilterSchema([...defaultSearchFormFilters, { name: 'My genotype', type: 'string' }])
                    }
                    clientConfig={testConfig.public}
                    fieldValues={{}}
                    setSomeFieldValues={setSomeFieldValues}
                    lapisUrl='http://lapis.dummy.url'
                    searchVisibilities={defaultSearchVisibilities}
                    setASearchVisibility={setASearchVisibility}
                    referenceGenomesMap={multiPathogenReferenceGenomesMap}
                    lapisSearchParameters={{}}
                    showMutationSearch={true}
                    suborganismIdentifierField='My genotype'
                    selectedSuborganism={null}
                    setSelectedSuborganism={setSelectedSuborganism}
                    selectedReferences={{}}
                />
            </QueryClientProvider>,
        );

        const suborganismSelector = await screen.findByRole('combobox', { name: 'My genotype' });
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

    describe('suborganism specific search fields', () => {
        const filterSchema = new MetadataFilterSchema([
            {
                name: 'field1',
                type: 'string',
                displayName: 'Field 1',
                initiallyVisible: true,
                onlyForReferenceName: 'suborganism1',
            },
            {
                name: 'field2',
                type: 'string',
                displayName: 'Field 2',
                initiallyVisible: true,
                onlyForReferenceName: 'suborganism2',
            },
        ]);
        const searchVisibilities = new Map<string, MetadataVisibility>([
            ['field1', new MetadataVisibility(true, 'suborganism1')],
            ['field2', new MetadataVisibility(true, 'suborganism2')],
        ]);

        const field1 = () => screen.queryByLabelText('Field 1');
        const field2 = () => screen.queryByLabelText('Field 2');

        it('should not display fields that are not for the currently selected suborganism', () => {
            renderSearchForm({
                filterSchema,
                searchVisibilities,
                suborganismIdentifierField: 'My genotype',
                selectedSuborganism: 'suborganism1',
            });

            expect(field1()).toBeVisible();
            expect(field2()).not.toBeInTheDocument();
        });

        it('should display suborganism specific fields when no suborganism is selected', () => {
            renderSearchForm({
                filterSchema,
                searchVisibilities,
                suborganismIdentifierField: 'My genotype',
                selectedSuborganism: null,
            });

            expect(field1()).toBeVisible();
            expect(field2()).toBeVisible();
        });
    });
});
