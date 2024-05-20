import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { testConfig, testOrganism } from '../../../vitest.setup.ts';
import { routes, SEARCH } from '../../routes/routes.ts';
import type { MetadataFilter } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

global.ResizeObserver = class FakeResizeObserver {
    // This is needed or we get a test failure: https://github.com/tailwindlabs/headlessui/discussions/2414
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility, @typescript-eslint/no-empty-function
    observe() {}
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility, @typescript-eslint/no-empty-function
    disconnect() {}
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility, @typescript-eslint/no-empty-function
    unobserve() {}
};

vi.mock('../../config', () => ({
    fetchAutoCompletion: vi.fn().mockResolvedValue([]),
    getLapisUrl: vi.fn().mockReturnValue('lapis.dummy.url'),
}));

const queryClient = new QueryClient();

const defaultSearchFormFilters: MetadataFilter[] = [
    {
        name: 'field1',
        type: 'string' as const,
        label: 'Field 1',
        autocomplete: false,
        initiallyVisible: true,
    },
    {
        name: 'field2',
        type: 'date' as const,
        autocomplete: false,
        label: 'Field 2',
        initiallyVisible: true,
    },
    {
        name: 'field3',
        type: 'pango_lineage' as const,
        label: 'Field 3',
        autocomplete: true,
        initiallyVisible: true,
    },
];

const defaultReferenceGenomesSequenceNames: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
};

function renderSearchForm(
    searchFormFilters: MetadataFilter[] = [...defaultSearchFormFilters],
    clientConfig: ClientConfig = testConfig.public,
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames = defaultReferenceGenomesSequenceNames,
    filterValues: { [key: string]: string } = {},
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SearchForm
                organism={testOrganism}
                filters={searchFormFilters}
                initialAccessionFilter={{}}
                initialMutationFilter={{}}
                clientConfig={clientConfig}
                classOfSearchPage={SEARCH}
                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                filterValues={filterValues}
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

        expect(screen.getByLabelText('Field 1')).toBeDefined();
        expect(screen.getByText('Field 2')).toBeDefined();
        expect(screen.getByLabelText('Field 3')).toBeDefined();
    });

    test('should redirect according to filters', async () => {
        renderSearchForm();

        const filterValue = 'test';
        await userEvent.type(screen.getByLabelText('Field 1'), filterValue);

        const expectedFilters = [
            { ...defaultSearchFormFilters[0], filterValue },
        ];

        expect(window.location.href).toBe(routes.searchPage(testOrganism, expectedFilters));
    });

    test('should not render the form with fields with flag notSearchable', async () => {
        renderSearchForm([
            ...defaultSearchFormFilters,
            {
                name: 'NotSearchable',
                type: 'string' as const,
                autocomplete: false,
                notSearchable: true,
                initiallyVisible: true,
            },
        ]);

        expect(screen.getByLabelText('Field 1')).toBeDefined();
        expect(screen.queryByPlaceholderText('NotSearchable')).not.toBeInTheDocument();
    });

    test('should display dates of timestamp fields', async () => {
        const timestampFieldName = 'timestampField';
        renderSearchForm(
            [
                {
                    name: timestampFieldName,
                    type: 'timestamp' as const,
                    initiallyVisible: true,
                },
            ],
            testConfig.public,
            defaultReferenceGenomesSequenceNames,
            { [timestampFieldName]: '1706147200' }
        );

        const timestampLabel = screen.getByText('Timestamp field');
        const timestampField = timestampLabel.nextElementSibling?.getElementsByTagName('input')[0];
        if (!timestampField) {
            throw new Error('Timestamp field not found');
        }
        expect(timestampField).toHaveValue('2024-01-25');

        await userEvent.type(timestampField, '2025');

        expect(window.location.href).toContain(`${timestampFieldName}=1737769600`);
    });

    test('should display dates of date fields', async () => {
        const dateFieldName = 'dateField';
        renderSearchForm(
            [
                {
                    name: dateFieldName,
                    type: 'date' as const,
                    initiallyVisible: true,
                },
            ],
            testConfig.public,
            defaultReferenceGenomesSequenceNames,
            { [dateFieldName]: '2024-01-25' }
        );

        const dateLabel = screen.getByText('Date field');
        const dateField = dateLabel.nextElementSibling?.getElementsByTagName('input')[0];
        if (!dateField) {
            throw new Error('Date field not found');
        }
        expect(dateField).toHaveValue('2024-01-25');

        await userEvent.type(dateField, '2025');

        expect(window.location.href).toContain(`${dateFieldName}=2025-01-25`);
    });

    test('toggle field visibility', async () => {
        renderSearchForm();

        expect(await screen.findByLabelText('Field 1')).toBeVisible();

        const customizeButton = await screen.findByRole('button', { name: 'Customize fields' });
        await userEvent.click(customizeButton);

        const field1Checkbox = await screen.findByRole('checkbox', { name: 'Field 1' });
        expect(field1Checkbox).toBeChecked();

        await userEvent.click(field1Checkbox);

        const closeButton = await screen.findByRole('button', { name: 'Close' });
        await userEvent.click(closeButton);

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        });

        expect(screen.queryByLabelText('Field 1')).not.toBeInTheDocument();
    });
});
