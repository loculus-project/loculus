import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi, beforeEach } from 'vitest';

import { SearchForm } from './SearchForm';
import type { ClientConfig, Filter } from '../../types';

vi.mock('../../config', () => ({
    fetchAutoCompletion: vi.fn().mockResolvedValue([]),
}));

const queryClient = new QueryClient();

const defaultMetadataSettings: [Filter, Filter, Filter] = [
    { name: 'field1', type: 'string', label: 'Field 1', autocomplete: false, filter: '' },
    { name: 'field2', type: 'date', autocomplete: false, filter: '' },
    { name: 'field3', type: 'pango_lineage', label: 'Field 3', autocomplete: true, filter: '' },
];
const dummyConfig = {} as ClientConfig;
function renderSearchForm(
    metadataSettings: Filter[] = defaultMetadataSettings,
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

    test('should render the form with all fields', async () => {
        renderSearchForm();

        expect(screen.getByPlaceholderText('Field 1')).toBeDefined();
        expect(screen.getByLabelText('Field2')).toBeDefined();
        expect(screen.getByLabelText('Field 3')).toBeDefined();
    });

    test('should redirect according to filters', async () => {
        renderSearchForm();

        await userEvent.type(screen.getByPlaceholderText('Field 1'), 'test');

        const searchButton = screen.getByRole('button', { name: 'Search' });
        await userEvent.click(searchButton);

        expect(window.location.href).toBe('search?field1=test');
    });
});
