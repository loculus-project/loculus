import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import type { MetadataFilter } from '../../types/config.ts';
import {
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import type { ReferenceSelection } from '../../utils/referenceSelection.ts';
import { MetadataFilterSchema, MetadataVisibility } from '../../utils/search.ts';

vi.mock('../../services/serviceHooks.ts');
vi.mock('../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn().mockReturnValue({
    data: { data: [] },
    isPending: false,
    error: null,
    mutate: vi.fn(),
});
// @ts-expect-error mock implementation for test double
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
lapisClientHooks.mockReturnValue({
    useAggregated: mockUseAggregated,
});

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

const defaultSearchVisibilities = new Map<string, MetadataVisibility>([
    ['field1', new MetadataVisibility(true, undefined)],
    ['field3', new MetadataVisibility(true, undefined)],
]);

const setSomeFieldValues = vi.fn();
const setASearchVisibility = vi.fn();

const renderSearchForm = ({
    filterSchema = new MetadataFilterSchema([...defaultSearchFormFilters]),
    fieldValues = {},
    referenceGenomesInfo = SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
    lapisSearchParameters = {},
    referenceSelection,
    searchVisibilities = defaultSearchVisibilities,
}: {
    filterSchema?: MetadataFilterSchema;
    fieldValues?: Record<string, string>;
    referenceGenomesInfo?: ReferenceGenomesInfo;
    lapisSearchParameters?: Record<string, string>;
    referenceSelection?: ReferenceSelection;
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
        referenceGenomesInfo: referenceGenomesInfo,
        lapisSearchParameters,
        showMutationSearch: true,
        referenceSelection,
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

    it('should render the reference selector in the multiReference case', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { 'My genotype': 'ref1', count: 100 },
                    { 'My genotype': 'ref2', count: 200 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });

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
                    referenceGenomesInfo={SINGLE_SEG_MULTI_REF_REFERENCEGENOMES}
                    lapisSearchParameters={{}}
                    showMutationSearch={true}
                    referenceSelection={{
                        referenceIdentifierField: 'My genotype',
                        selectedReferences: {},
                        setSelectedReferences: vi.fn(),
                    }}
                />
            </QueryClientProvider>,
        );

        const referenceInput = await screen.findByLabelText('My genotype');
        expect(referenceInput).toBeInTheDocument();

        await userEvent.click(referenceInput);
        const options = await screen.findAllByRole('option');
        const ref1Option = options.find((opt) => opt.textContent?.includes('ref1'));
        await userEvent.click(ref1Option!);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['My genotype', 'ref1']);
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
                onlyForReference: 'suborganism1',
            },
            {
                name: 'field2',
                type: 'string',
                displayName: 'Field 2',
                initiallyVisible: true,
                onlyForReference: 'suborganism2',
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
                referenceSelection: {
                    referenceIdentifierField: 'My genotype',

                    selectedReferences: { main: 'suborganism1' },
                    setSelectedReferences: vi.fn(),
                },
            });

            expect(field1()).toBeVisible();
            expect(field2()).not.toBeInTheDocument();
        });
    });
});
