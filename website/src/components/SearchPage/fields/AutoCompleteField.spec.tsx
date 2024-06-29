import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AutoCompleteField } from './AutoCompleteField';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import { type MetadataFilter } from '../../../types/config.ts';

vi.mock('../../../services/serviceHooks.ts');
vi.mock('../../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn();
// @ts-expect-error because mockReturnValue is not defined in the type definition
lapisClientHooks.mockReturnValue({
    zodiosHooks: {
        useAggregated: mockUseAggregated,
    },
});

describe('AutoCompleteField', () => {
    const field: MetadataFilter = {
        name: 'testField',
        label: 'Test Field',
        type: 'string',
        autocomplete: true,
    };
    const setAFieldValue = vi.fn();
    const lapisUrl = 'https://example.com/api';
    const lapisSearchParameters = { param1: 'value1' };

    beforeEach(() => {
        setAFieldValue.mockClear();
    });

    it('renders input and shows all options on empty input', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                ],
            },
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });

        render(
            <AutoCompleteField
                field={field}
                setAFieldValue={setAFieldValue}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        expect(input).toBeInTheDocument();

        fireEvent.focus(input);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(2);
        expect(options[0]).toHaveTextContent('Option 1(10)');
        expect(options[1]).toHaveTextContent('Option 2(20)');
    });

    it('filters options based on query', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                ],
            },
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
                field={field}
                setAFieldValue={setAFieldValue}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        fireEvent.focus(input);

        fireEvent.change(input, { target: { value: 'Option 2' } });

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('Option 2(20)');
    });

    it('displays loading state when aggregated endpoint is in isLoading state', () => {
        mockUseAggregated.mockReturnValueOnce({
            data: null,
            isLoading: true,
            error: null,
            mutate: vi.fn(),
        });

        render(
            <AutoCompleteField
                field={field}
                setAFieldValue={setAFieldValue}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        fireEvent.focus(input);

        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays error message when aggregated returns an error', () => {
        mockUseAggregated.mockReturnValueOnce({
            data: null,
            isLoading: false,
            error: { message: 'Error message', stack: 'Error stack' },
            mutate: vi.fn(),
        });

        render(
            <AutoCompleteField
                field={field}
                setAFieldValue={setAFieldValue}
                lapisUrl={lapisUrl}
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        fireEvent.focus(input);

        expect(screen.getByText('No options available')).toBeInTheDocument();
    });

    it('clears input value on clear button click', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                ],
            },
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
                field={field}
                setAFieldValue={setAFieldValue}
                lapisUrl={lapisUrl}
                fieldValue='Option 1'
                lapisSearchParameters={lapisSearchParameters}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        fireEvent.focus(input);

        const clearButton = screen.getByLabelText('Clear');
        fireEvent.click(clearButton);

        expect(setAFieldValue).toHaveBeenCalledWith('testField', '');
    });
});
