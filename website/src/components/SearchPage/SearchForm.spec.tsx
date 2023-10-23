import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SearchForm } from './SearchForm';
import { routes } from '../../routes.ts';
import type { ClientConfig, Filter } from '../../types';

vi.mock('../../config', () => ({
    fetchAutoCompletion: vi.fn().mockResolvedValue([]),
}));

const queryClient = new QueryClient();

const defaultMetadataSettings = [
    { name: 'field1', type: 'string' as const, label: 'Field 1', autocomplete: false, filterValue: '' },
    { name: 'field2', type: 'date' as const, autocomplete: false, filterValue: '' },
    { name: 'field3', type: 'pango_lineage' as const, label: 'Field 3', autocomplete: true, filterValue: '' },
];

const dummyConfig = { backendUrl: 'dummy', lapisUrl: 'dummy' } as ClientConfig;

function renderSearchForm(
    metadataSettings: Filter[] = [...defaultMetadataSettings],
    clientConfig: ClientConfig = dummyConfig,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SearchForm metadataSettings={metadataSettings} clientConfig={clientConfig} />
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

        expect(window.location.href).toBe(routes.searchPage([{ ...defaultMetadataSettings[0], filterValue }]));
    });

    test('should not render the form with fields with flag notSearchable', async () => {
        renderSearchForm([
            ...defaultMetadataSettings,
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

    test('should add default values for isLatestVersion fields to search', async () => {
        renderSearchForm([
            ...defaultMetadataSettings,
            {
                name: 'isLatestVersion',
                type: 'string' as const,
                autocomplete: false,
                filterValue: '',
                notSearchable: true,
            },
        ]);

        await userEvent.type(screen.getByPlaceholderText('Field 1'), 'test');

        const searchButton = screen.getByRole('button', { name: 'Search' });
        await userEvent.click(searchButton);

        expect(window.location.href).toBe('/search?field1=test&isLatestVersion=true&page=1');
    });
});
