import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SingleChoiceAutoCompleteField } from './SingleChoiceAutoCompleteField.tsx';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { MetadataFilter } from '../../../types/config.ts';

vi.mock('../../../services/serviceHooks.ts');
vi.mock('../../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn();
// @ts-expect-error mock implementation for test double
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
lapisClientHooks.mockReturnValue({
    useAggregated: mockUseAggregated,
});

describe('SingleChoiceAutoCompleteField', () => {
    const field: MetadataFilter = {
        name: 'testField',
        displayName: 'Test Field',
        type: 'string',
        autocomplete: true,
    };
    const setSomeFieldValues = vi.fn();
    const lapisUrl = 'https://example.com/api';
    const lapisSearchParameters = { param1: 'value1' };

    beforeEach(() => {
        setSomeFieldValues.mockClear();
        mockUseAggregated.mockReset();
    });

    it('renders input and shows all options on empty input', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={field.name}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        expect(input).toBeInTheDocument();

        await userEvent.click(input);

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
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={field.name}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        fireEvent.change(input, { target: { value: 'Option 2' } });

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(1);
        expect(options[0]).toHaveTextContent('Option 2(20)');
    });

    it('displays loading state when aggregated endpoint is loading', async () => {
        mockUseAggregated.mockReturnValue({
            data: null,
            isPending: true,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={field.name}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('displays fallback when aggregated endpoint returns an error', async () => {
        mockUseAggregated.mockReturnValue({
            data: null,
            isPending: false,
            error: { message: 'Error message', stack: 'Error stack' },
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={field.name}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        expect(screen.getByText('No options available')).toBeInTheDocument();
    });

    it('calls setSomeFieldValues when an option is selected', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={field.name}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        await userEvent.click(options[0]);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', 'Option 1']);
    });

    it('clears input value when clear button is clicked', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [
                    { testField: 'Option 1', count: 10 },
                    { testField: 'Option 2', count: 20 },
                ],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={'Option 1'}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const clearButton = screen.getByLabelText('Clear Test Field');
        await userEvent.click(clearButton);

        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', '']);
    });

    it('allows selecting blank option', async () => {
        mockUseAggregated.mockReturnValue({
            data: {
                data: [{ testField: null, count: 5 }],
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={field.name}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options[0]).toHaveTextContent('(blank)(5)');
        await userEvent.click(options[0]);
        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', null]);
    });

    it('limits the number of displayed options', async () => {
        const data = [];
        for (let i = 0; i < 100; i++) {
            data.push({ testField: `Option ${i}`, count: 10 });
        }
        mockUseAggregated.mockReturnValue({
            data: {
                data,
            },
            isPending: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <SingleChoiceAutoCompleteField
                placeholder={field.displayName ?? field.name}
                value={'Option 1'}
                onChange={(v) => setSomeFieldValues([field.name, v])}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                maxDisplayedOptions={50}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(50);
    });
});
