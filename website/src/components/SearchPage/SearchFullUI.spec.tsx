/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-empty-function */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchFullUI } from './SearchFullUI';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import type { MetadataFilter, Schema } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';

global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
};

vi.mock('../../config', () => ({
    fetchAutoCompletion: vi.fn().mockResolvedValue([]),
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy.url'),
}));

vi.mock('../../services/serviceHooks.ts', () => ({
    lapisClientHooks: vi.fn(),
}));

vi.mock('../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn();
const mockUseDetails = vi.fn();
(lapisClientHooks as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    zodiosHooks: {
        useAggregated: mockUseAggregated,
        useDetails: mockUseDetails,
    },
});

const defaultSearchFormFilters: MetadataFilter[] = [
    {
        name: 'field1',
        type: 'date',
        autocomplete: false,
        label: 'Field 1',
        initiallyVisible: true,
    },
    {
        name: 'field3',
        type: 'pango_lineage',
        label: 'Field 3',
        autocomplete: true,
        initiallyVisible: true,
    },
];

const defaultReferenceGenomesSequenceNames: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
};

function renderSearchFullUI({
    searchFormFilters = [...defaultSearchFormFilters],
    clientConfig = testConfig.public,
    referenceGenomesSequenceNames = defaultReferenceGenomesSequenceNames,
} = {}) {
    const metadataSchema: MetadataFilter[] = searchFormFilters.map((filter) => ({
        ...filter,
        grouped: false,
    }));

    const props = {
        accessToken: 'dummyAccessToken',
        referenceGenomesSequenceNames,
        myGroups: [],
        organism: testOrganism,
        clientConfig,
        schema: {
            metadata: metadataSchema,
            tableColumns: ['field1', 'field3'],
            primaryKey: 'accession',
        } as Schema,
    };

    render(
        <QueryClientProvider client={new QueryClient()}>
            <SearchFullUI {...props} />
        </QueryClientProvider>,
    );
}

describe('SearchFullUI', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: {
                href: '',
            },
        });

        mockUseAggregated.mockReturnValue({
            data: {
                data: [{ count: 2 }],
            },
            isLoading: false,
            error: null,
            isError: false,
            mutate: vi.fn(),
        });

        mockUseDetails.mockReturnValue({
            data: {
                data: [
                    { accession: 'LOC_123456', field1: '2022-01-01', field3: 'Lineage 1' },
                    { accession: 'LOC_789012', field1: '2022-01-02', field3: 'Lineage 2' },
                ],
            },
            isLoading: false,
            error: null,
            isError: false,
            mutate: vi.fn(),
        });
    });

    it('renders without crashing', () => {
        renderSearchFullUI();
        expect(screen.getByText(/Search returned 2 sequences/i)).toBeInTheDocument();
    });

    it('displays sequences data correctly', async () => {
        renderSearchFullUI();

        await waitFor(() => {
            expect(screen.getByText('LOC_123456')).toBeInTheDocument();
            expect(screen.getByText('2022-01-01')).toBeInTheDocument();
            expect(screen.getByText('LOC_789012')).toBeInTheDocument();
            expect(screen.getByText('2022-01-02')).toBeInTheDocument();
        });
    });

    it('should render the form with all fields that are searchable', async () => {
        renderSearchFullUI();

        expect(screen.getByLabelText('Accession')).toBeInTheDocument();
        expect(screen.getByText('Field 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Field 3')).toBeInTheDocument();
    });

    it('should not render the form with fields with flag notSearchable', async () => {
        renderSearchFullUI({
            searchFormFilters: [
                ...defaultSearchFormFilters,
                {
                    name: 'NotSearchable',
                    type: 'string',
                    autocomplete: false,
                    notSearchable: true,
                    initiallyVisible: true,
                },
            ],
        });

        expect(screen.getByLabelText('Accession')).toBeInTheDocument();
        expect(screen.queryByLabelText('NotSearchable')).not.toBeInTheDocument();
    });

    it('should display timestamp field', async () => {
        const timestampFieldName = 'timestampField';
        renderSearchFullUI({
            searchFormFilters: [
                {
                    name: timestampFieldName,
                    type: 'timestamp',
                    initiallyVisible: true,
                },
            ],
        });

        const timestampLabel = screen.getByText('Timestamp field');
        const timestampField = timestampLabel.nextElementSibling?.getElementsByTagName('input')[0];
        if (!timestampField) {
            throw new Error('Timestamp field not found');
        }
    });

    it('should display date field', async () => {
        const dateFieldName = 'dateField';
        renderSearchFullUI({
            searchFormFilters: [
                {
                    name: dateFieldName,
                    type: 'date',
                    initiallyVisible: true,
                    rangeSearch: true,
                    displayName: 'Date field',
                },
            ],
        });

        const dateLabel = screen.getByText('Date field');
        const dateField = dateLabel.nextElementSibling?.getElementsByTagName('input')[0];
        if (!dateField) {
            throw new Error('Date field not found');
        }
    });
});
