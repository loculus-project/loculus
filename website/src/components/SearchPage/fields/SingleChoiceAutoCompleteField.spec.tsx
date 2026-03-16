import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SingleChoiceAutoCompleteField } from './SingleChoiceAutoCompleteField';
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
                fieldValue='Option 1'
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options[0]).toHaveTextContent('(blank)(5)');
        await userEvent.click(options[0]);
        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', null]);
    });

    describe('fieldPresets', () => {
        const fieldPresets = {
            'Option 1': { otherField: 'presetValue1', anotherField: 'presetValue2' },
            'Option 2': { otherField: 'presetValue3' },
        };

        it('applies preset field values when an option with a preset is selected', async () => {
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
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    fieldPresets={fieldPresets}
                />,
            );

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]);

            expect(setSomeFieldValues).toHaveBeenCalledWith(
                ['testField', 'Option 1'],
                ['otherField', 'presetValue1'],
                ['anotherField', 'presetValue2'],
            );
        });

        it('clears previous preset fields when switching to a different option', async () => {
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
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    fieldPresets={fieldPresets}
                />,
            );

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            // Select Option 1 (has two preset fields)
            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]);
            setSomeFieldValues.mockClear();

            // Blur then re-open the dropdown to select Option 2
            await userEvent.click(document.body);
            await userEvent.click(input);
            const options2 = await screen.findAllByRole('option');
            await userEvent.click(options2[1]);

            // Should clear both fields from the previous preset, then apply Option 2's preset
            expect(setSomeFieldValues).toHaveBeenCalledWith(
                ['testField', 'Option 2'],
                ['otherField', ''],
                ['anotherField', ''],
                ['otherField', 'presetValue3'],
            );
        });

        it('clears preset field values when the clear button is clicked', async () => {
            mockUseAggregated.mockReturnValue({
                data: {
                    data: [{ testField: 'Option 1', count: 10 }],
                },
                isPending: false,
                error: null,
                mutate: vi.fn(),
            });
            render(
                <SingleChoiceAutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    fieldValue='Option 1'
                    fieldPresets={fieldPresets}
                />,
            );

            // Select Option 1 to apply preset
            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);
            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]);
            setSomeFieldValues.mockClear();

            // Now clear
            const clearButton = screen.getByLabelText('Clear Test Field');
            await userEvent.click(clearButton);

            expect(setSomeFieldValues).toHaveBeenCalledWith(
                ['testField', ''],
                ['otherField', ''],
                ['anotherField', ''],
            );
        });

        it('does not apply preset fields when selected option has no preset', async () => {
            mockUseAggregated.mockReturnValue({
                data: {
                    data: [{ testField: 'Option 3', count: 5 }],
                },
                isPending: false,
                error: null,
                mutate: vi.fn(),
            });
            render(
                <SingleChoiceAutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    fieldPresets={fieldPresets}
                />,
            );

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);
            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]);

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', 'Option 3']);
        });
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
                field={field}
                optionsProvider={{
                    type: 'generic',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                }}
                setSomeFieldValues={setSomeFieldValues}
                fieldValue='Option 1'
                maxDisplayedOptions={50}
            />,
        );

        const input = screen.getByLabelText('Test Field');
        await userEvent.click(input);

        const options = await screen.findAllByRole('option');
        expect(options).toHaveLength(50);
    });
});
