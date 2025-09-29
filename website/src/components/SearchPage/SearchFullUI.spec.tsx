import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type InnerSearchFullUIProps, SearchFullUI } from './SearchFullUI';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import type { FieldValues, MetadataFilter, Schema } from '../../types/config.ts';
import type { ReferenceAccession, ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

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
    {
        name: 'field4',
        type: 'string',
        autocomplete: false,
        displayName: 'Field 4',
        notSearchable: true,
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

function renderSearchFullUI({
    searchFormFilters = [...defaultSearchFormFilters],
    clientConfig = testConfig.public,
    referenceGenomesSequenceNames = defaultReferenceGenomesSequenceNames,
    hiddenFieldValues = {},
}: {
    searchFormFilters?: MetadataFilter[];
    clientConfig?: ClientConfig;
    referenceGenomesSequenceNames?: ReferenceGenomesSequenceNames;
    hiddenFieldValues?: FieldValues;
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
            submissionDataTypes: {
                consensusSequences: true,
            },
        } as Schema,
        initialData: [],
        initialCount: 0,
        initialQueryDict: {},
        hiddenFieldValues,
    } satisfies InnerSearchFullUIProps;

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
        window.history.replaceState({ path: '' }, '', '');

        mockUseAggregated.mockReturnValue({
            data: {
                data: [{ count: 2 }],
            },
            isPending: false,
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
            isPending: false,
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

    it('should render the form with all fields that are searchable', () => {
        renderSearchFullUI();

        expect(screen.getByLabelText('Accession')).toBeInTheDocument();
        expect(screen.getByLabelText('Field 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Field 3')).toBeInTheDocument();
    });

    it('should not render the form with fields with flag notSearchable', () => {
        renderSearchFullUI({
            searchFormFilters: [
                {
                    name: 'NotSearchable',
                    displayName: 'Not searchable',
                    type: 'string',
                    autocomplete: false,
                    notSearchable: true,
                    initiallyVisible: true,
                },
            ],
        });

        expect(screen.getByLabelText('Accession')).toBeInTheDocument();
        expect(screen.queryByLabelText('Not searchable')).not.toBeInTheDocument();
    });

    it('should display timestamp field', () => {
        const timestampFieldName = 'timestampField';
        renderSearchFullUI({
            searchFormFilters: [
                {
                    name: timestampFieldName,
                    type: 'timestamp',
                    displayName: 'Timestamp field',
                    initiallyVisible: true,
                },
            ],
        });

        const timestampField = screen.getByLabelText('Timestamp field');
        expect(timestampField).toBeInTheDocument();
    });

    it('should display date field', () => {
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
        const customizeButton = await screen.findByRole('button', { name: 'Add search fields' });
        await userEvent.click(customizeButton);
        const field1Checkbox = await screen.findByRole('checkbox', { name: 'Field 1' });
        expect(field1Checkbox).toBeChecked();
        await userEvent.click(field1Checkbox);
        const closeButton = await screen.findByTestId('field-selector-close-button');
        await userEvent.click(closeButton);

        expect(screen.queryByLabelText('Field 1')).not.toBeInTheDocument();
    });

    it('does not store default invisible search field visibilities in URL when set to false as this is unneeded', async () => {
        renderSearchFullUI({
            searchFormFilters: [
                ...defaultSearchFormFilters,
                {
                    name: 'field2',
                    type: 'string',
                    displayName: 'Field 2',
                    autocomplete: false,
                    initiallyVisible: false,
                },
            ],
        });
        const customizeButton = await screen.findByRole('button', { name: 'Add search fields' });
        await userEvent.click(customizeButton);
        const selectNoneButton = await screen.findByRole('button', { name: 'Select none' });
        await userEvent.click(selectNoneButton);
        const closeButton = await screen.findByTestId('field-selector-close-button');
        await userEvent.click(closeButton);
        await waitFor(() => {
            expect(window.history.state.path).toContain('visibility_field1=false');
            expect(window.history.state.path).not.toContain('visibility_field2=false');
        });
    });

    it('does not add hidden field values to the URL when selecting none', async () => {
        renderSearchFullUI({
            searchFormFilters: [
                ...defaultSearchFormFilters,
                {
                    name: 'isRevocation',
                    type: 'string',
                    displayName: 'isRevocation',
                    autocomplete: false,
                    initiallyVisible: false,
                },
                {
                    name: 'versionStatus',
                    type: 'string',
                    displayName: 'versionStatus',
                    autocomplete: false,
                    initiallyVisible: false,
                },
            ],
            hiddenFieldValues: {
                isRevocation: 'false',
                versionStatus: 'LATEST_VERSION',
            },
        });
        const customizeButton = await screen.findByRole('button', { name: 'Add search fields' });
        await userEvent.click(customizeButton);
        const selectNoneButton = await screen.findByRole('button', { name: 'Select none' });
        await userEvent.click(selectNoneButton);
        const closeButton = await screen.findByTestId('field-selector-close-button');
        await userEvent.click(closeButton);
        await waitFor(() => {
            expect(window.history.state.path).not.toContain('isRevocation=');
            expect(window.history.state.path).not.toContain('versionStatus=');
        });
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
        const closeButton = await screen.findByTestId('field-selector-close-button');
        await userEvent.click(closeButton);
        expect(screen.getByRole('columnheader', { name: 'Field 4' })).toBeVisible();
    });

    it('does not store default invisible column visibilities when selecting none', async () => {
        renderSearchFullUI({});
        const customizeButton = await screen.findByRole('button', { name: 'Customize columns' });
        await userEvent.click(customizeButton);
        const selectNoneButton = await screen.findByRole('button', { name: 'Select none' });
        await userEvent.click(selectNoneButton);
        const closeButton = await screen.findByTestId('field-selector-close-button');
        await userEvent.click(closeButton);
        await waitFor(() => {
            expect(window.history.state.path).toContain('column_field1=false');
            expect(window.history.state.path).not.toContain('column_field4=false');
        });
    });
});
