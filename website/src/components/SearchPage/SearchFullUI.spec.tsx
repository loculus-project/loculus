/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/no-empty-function */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchFullUI } from './SearchFullUI';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import type { MetadataFilter, Schema } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../types/referencesGenomes.ts';

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
        type: 'string',
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
    {
        name: 'field4',
        type: 'string',
        autocomplete: false,
        label: 'Field 4',
        displayName: 'Field 4',
        notSearchable: true,
    },
];

const defaultAccession: ReferenceAccession = {
    name: 'main',
    insdc_accession_full: undefined,
};

const defaultReferenceGenomesSequenceNames: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
    insdc_accession_full: [defaultAccession],
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
        initialData: [],
        
        initialCount : 0
        , initialQueryDict : {}
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

    it('toggle field visibility', async () => {
        renderSearchFullUI({});
        expect(await screen.findByLabelText('Field 1')).toBeVisible();
        const customizeButton = await screen.findByRole('button', { name: 'Select fields' });
        await userEvent.click(customizeButton);
        const field1Checkbox = await screen.findByRole('checkbox', { name: 'Field 1' });
        expect(field1Checkbox).toBeChecked();
        await userEvent.click(field1Checkbox);
        const closeButton = await screen.findByRole('button', { name: 'Close' });
        await userEvent.click(closeButton);
        await waitForElementToBeRemoved(() => screen.queryByText('Toggle the visibility of search fields'));
        expect(screen.queryByLabelText('Field 1')).not.toBeInTheDocument();
    });

    it('should update the URL with query parameters when a search is performed', async () => {
        renderSearchFullUI();

        const field1Input = await screen.findByLabelText('Field 1');
        await userEvent.type(field1Input, 'abc');

        await waitFor(() => {
            expect(window.history.state.path).toContain('?field1=abc');
        });
    });

    it('toggle column visibility', async () => {
        renderSearchFullUI({});
        // expect we can't see field 4
        expect(screen.queryByRole('columnheader', { name: 'Field 4' })).not.toBeInTheDocument();
        const customizeButton = await screen.findByRole('button', { name: 'Customize columns' });
        await userEvent.click(customizeButton);
        const field4Checkbox = await screen.findByRole('checkbox', { name: 'Field 4' });
        expect(field4Checkbox).not.toBeChecked();
        await userEvent.click(field4Checkbox);
        expect(field4Checkbox).toBeChecked();
        const closeButton = await screen.findByRole('button', { name: 'Close' });
        await userEvent.click(closeButton);
        screen.logTestingPlaygroundURL();
        expect(screen.getByRole('columnheader', { name: 'Field 4' })).toBeVisible();
    });
});
