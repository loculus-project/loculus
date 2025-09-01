import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AutoCompleteField } from './AutoCompleteField';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import { type MetadataFilter } from '../../../types/config.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';

vi.mock('../../../services/serviceHooks.ts');
vi.mock('../../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockUseAggregated = vi.fn();
// @ts-expect-error because mockReturnValue is not defined in the type definition
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
lapisClientHooks.mockReturnValue({
    zodiosHooks: {
        useAggregated: mockUseAggregated,
    },
});

describe('AutoCompleteField', () => {
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
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
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

    it('displays loading state when aggregated endpoint is in isLoading state', async () => {
        mockUseAggregated.mockReturnValue({
            data: null,
            isLoading: true,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
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

    it('displays error message when aggregated returns an error', async () => {
        mockUseAggregated.mockReturnValue({
            data: null,
            isLoading: false,
            error: { message: 'Error message', stack: 'Error stack' },
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
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

    it('calls setAFieldValue, when an option is selected', async () => {
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
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
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
        expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', NULL_QUERY_VALUE]);
    });

    it('shows at most a configured number of options', async () => {
        const data = [];
        for (let i = 0; i < 100; i++) {
            data.push({ testField: `Option ${i}`, count: 10 });
        }
        mockUseAggregated.mockReturnValue({
            data: {
                data,
            },
            isLoading: false,
            error: null,
            mutate: vi.fn(),
        });
        render(
            <AutoCompleteField
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

    describe('multi-select mode', () => {
        it('allows selecting multiple options', async () => {
            mockUseAggregated.mockReturnValue({
                data: {
                    data: [
                        { testField: 'Option 1', count: 10 },
                        { testField: 'Option 2', count: 20 },
                        { testField: 'Option 3', count: 30 },
                    ],
                },
                isLoading: false,
                error: null,
                mutate: vi.fn(),
            });

            // Test that multi-select calls setSomeFieldValues with an array
            render(
                <AutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                    fieldValues={[]}
                />,
            );

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            // Select first option
            const options = await screen.findAllByRole('option');
            await userEvent.click(options[0]);

            // In multi-select mode, it should call with an array
            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 1']]);
        });

        it('displays selected values as badges', async () => {
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
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                    fieldValues={['Option 1', 'Option 2']}
                />,
            );

            // Check that badges are displayed
            expect(screen.getByText('Option 1')).toBeInTheDocument();
            expect(screen.getByText('Option 2')).toBeInTheDocument();

            // Check that remove buttons exist
            const removeButtons = screen.getAllByLabelText(/Remove/);
            expect(removeButtons).toHaveLength(2);
        });

        it('removes individual selected values when badge remove button is clicked', async () => {
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
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                    fieldValues={['Option 1', 'Option 2']}
                />,
            );

            // Click remove button for Option 1
            const removeButton = screen.getByLabelText('Remove Option 1');
            await userEvent.click(removeButton);

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 2']]);
        });

        it('clears all selections when clear button is clicked', async () => {
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
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                    fieldValues={['Option 1', 'Option 2']}
                />,
            );

            const clearButton = screen.getByLabelText('Clear Test Field');
            await userEvent.click(clearButton);

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', '']);
        });

        it('deselects an option when clicking on already selected option', async () => {
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

            // Test that clicking on a badge remove button works
            render(
                <AutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                    fieldValues={['Option 1', 'Option 2']}
                />,
            );

            // Verify the badges are displayed
            expect(screen.getByText('Option 1')).toBeInTheDocument();
            expect(screen.getByText('Option 2')).toBeInTheDocument();

            // Click remove button for Option 1
            const removeButton = screen.getByLabelText('Remove Option 1');
            await userEvent.click(removeButton);

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', ['Option 2']]);
        });

        it('handles blank values in multi-select mode', async () => {
            mockUseAggregated.mockReturnValue({
                data: {
                    data: [
                        { testField: null, count: 5 },
                        { testField: 'Option 1', count: 10 },
                    ],
                },
                isLoading: false,
                error: null,
                mutate: vi.fn(),
            });
            render(
                <AutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                />,
            );

            const input = screen.getByLabelText('Test Field');
            await userEvent.click(input);

            // Select blank option
            const options = await screen.findAllByRole('option');
            expect(options[0]).toHaveTextContent('(blank)(5)');
            await userEvent.click(options[0]);

            expect(setSomeFieldValues).toHaveBeenCalledWith(['testField', [NULL_QUERY_VALUE]]);
        });

        it('shows badges for selected options', async () => {
            mockUseAggregated.mockReturnValue({
                data: {
                    data: [
                        { testField: 'Option 1', count: 10 },
                        { testField: 'Option 2', count: 20 },
                        { testField: 'Option 3', count: 30 },
                    ],
                },
                isLoading: false,
                error: null,
                mutate: vi.fn(),
            });
            render(
                <AutoCompleteField
                    field={field}
                    optionsProvider={{
                        type: 'generic',
                        lapisUrl,
                        lapisSearchParameters,
                        fieldName: field.name,
                    }}
                    setSomeFieldValues={setSomeFieldValues}
                    multiSelect={true}
                    fieldValues={['Option 1', 'Option 3']}
                />,
            );

            // Check that the selected values are shown as badges
            expect(screen.getByText('Option 1')).toBeInTheDocument();
            expect(screen.getByText('Option 3')).toBeInTheDocument();

            // Check that unselected Option 2 is not shown as a badge
            const allOption2Elements = screen.queryAllByText('Option 2');
            expect(allOption2Elements).toHaveLength(0);
        });
    });
});
