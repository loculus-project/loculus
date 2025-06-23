import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DateRangeField } from './DateRangeField';
import { type GroupedMetadataFilter, type FieldValues } from '../../../types/config';

describe('DateRangeField', () => {
    function createRangeOverlapSearch(bound: 'lower' | 'upper') {
        return {
            rangeName: 'collectionDate',
            rangeDisplayName: 'not used',
            bound,
        };
    }

    const field: GroupedMetadataFilter = {
        name: 'collectionDateRange',
        displayName: 'Collection date',
        type: 'date',
        grouped: true,
        groupedFields: [
            {
                name: 'collectionDateRangeLowerFrom',
                type: 'date',
                rangeOverlapSearch: createRangeOverlapSearch('lower'),
            },
            {
                name: 'collectionDateRangeLowerTo',
                type: 'date',
                rangeOverlapSearch: createRangeOverlapSearch('lower'),
            },
            {
                name: 'collectionDateRangeUpperFrom',
                type: 'date',
                rangeOverlapSearch: createRangeOverlapSearch('upper'),
            },
            {
                name: 'collectionDateRangeUpperTo',
                type: 'date',
                rangeOverlapSearch: createRangeOverlapSearch('upper'),
            },
        ],
    };

    const fieldValues: FieldValues = {};
    const setSomeFieldValues = vi.fn();

    beforeEach(() => {
        setSomeFieldValues.mockClear();
    });

    it('renders the component', () => {
        render(<DateRangeField field={field} fieldValues={fieldValues} setSomeFieldValues={setSomeFieldValues} />);

        expect(screen.getByText('Collection date')).toBeInTheDocument();
    });

    type TestCase = {
        fieldValues: FieldValues;
        expected: boolean;
    };

    const cases: TestCase[] = [
        {
            fieldValues: { collectionDateRangeLowerFrom: '2024-01-01', collectionDateRangeUpperTo: '2024-12-31' },
            expected: true,
        },
        {
            fieldValues: { collectionDateRangeUpperTo: '2024-12-31' },
            expected: true,
        },
        {
            fieldValues: { collectionDateRangeLowerFrom: '2024-01-01' },
            expected: true,
        },
        {
            fieldValues: { collectionDateRangeUpperFrom: '2024-01-01', collectionDateRangeLowerTo: '2024-12-31' },
            expected: false,
        },
        {
            fieldValues: { collectionDateRangeUpperFrom: '2024-01-01' },
            expected: false,
        },
        {
            fieldValues: { collectionDateRangeLowerTo: '2024-12-31' },
            expected: false,
        },
    ];

    it.each(cases)('derives strict mode correctly from field values', ({ fieldValues, expected }: TestCase) => {
        render(<DateRangeField field={field} fieldValues={fieldValues} setSomeFieldValues={setSomeFieldValues} />);

        const strictCheckbox = screen.getByRole('checkbox');
        if (expected) {
            expect(strictCheckbox).toBeChecked();
        } else {
            expect(strictCheckbox).not.toBeChecked();
        }
    });

    it('derives switches mode correctly', async () => {
        render(
            <DateRangeField
                field={field}
                fieldValues={{ collectionDateRangeLowerFrom: '2024-01-01', collectionDateRangeUpperTo: '2024-12-31' }}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        expect(setSomeFieldValues).toHaveBeenCalledWith(
            ['collectionDateRangeLowerFrom', '2024-01-01'],
            ['collectionDateRangeUpperTo', '2024-12-31'],
            ['collectionDateRangeUpperFrom', null],
            ['collectionDateRangeLowerTo', null],
        );

        const strictCheckbox = screen.getByRole('checkbox');
        expect(strictCheckbox).toBeChecked();
        await userEvent.click(strictCheckbox);
        expect(strictCheckbox).not.toBeChecked();

        expect(setSomeFieldValues).toHaveBeenCalledWith(
            ['collectionDateRangeUpperFrom', '2024-01-01'],
            ['collectionDateRangeLowerTo', '2024-12-31'],
            ['collectionDateRangeLowerFrom', null],
            ['collectionDateRangeUpperTo', null],
        );
    });

    it('clears date fields when user clears input', async () => {
        const user = userEvent.setup();

        render(
            <DateRangeField
                field={field}
                fieldValues={{ collectionDateRangeLowerFrom: '2024-01-01', collectionDateRangeUpperTo: '2024-12-31' }}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        // Get text input via `sampleCollectionDateRange-from` id - not testid
        const fromInput = () => screen.getByText('From').closest('div')?.querySelector('input[type="text"]');
        const fromClear = () => screen.getByText('From').closest('div')?.querySelector('button');

        const toInput = () => screen.getByText('To').closest('div')?.querySelector('input[type="text"]');
        const toClear = () => screen.getByText('To').closest('div')?.querySelector('button');

        expect(fromInput()).toHaveValue('2024-01-01');
        expect(toInput()).toHaveValue('2024-12-31');

        await user.click(fromClear()!);

        expect(fromInput()).toHaveValue('');

        // Check that setSomeFieldValues was called with empty string for from field
        expect(setSomeFieldValues).toHaveBeenLastCalledWith(
            ['collectionDateRangeLowerFrom', ''],
            ['collectionDateRangeUpperTo', '2024-12-31'],
            ['collectionDateRangeUpperFrom', null],
            ['collectionDateRangeLowerTo', null],
        );

        // Clear the to input
        await user.click(toClear()!);

        // Check that setSomeFieldValues was called with empty string for both fields
        expect(setSomeFieldValues).toHaveBeenLastCalledWith(
            ['collectionDateRangeLowerFrom', ''],
            ['collectionDateRangeUpperTo', ''],
            ['collectionDateRangeUpperFrom', null],
            ['collectionDateRangeLowerTo', null],
        );
    });

    it('setting fieldValue to empty string clears date field', async () => {
        function Wrapper() {
            const [values, _setValues] = useState<FieldValues>({
                collectionDateRangeLowerFrom: '2024-01-01',
                collectionDateRangeUpperTo: '2024-12-31',
            });

            const setValues = useCallback((...fieldValuesToSet: [string, string | number | null][]) => {
                _setValues((state) => {
                    const newState = { ...state };
                    fieldValuesToSet.forEach(([k, v]) => (newState[k] = v));
                    return newState;
                });
            }, []);

            return (
                <div>
                    <DateRangeField field={field} fieldValues={values} setSomeFieldValues={setValues} />
                    <button
                        onClick={() =>
                            setValues(['collectionDateRangeLowerFrom', null], ['collectionDateRangeUpperTo', null])
                        }
                    >
                        Update Dates
                    </button>
                </div>
            );
        }

        const user = userEvent.setup();

        render(<Wrapper />);

        const fromInput = () => screen.getByText('From').closest('div')?.querySelector('input');
        const toInput = () => screen.getByText('To').closest('div')?.querySelector('input');
        const button = screen.getByText('Update Dates');

        expect(fromInput()).toHaveValue('2024-01-01');
        expect(toInput()).toHaveValue('2024-12-31');

        await user.click(button);

        expect(fromInput()).toHaveValue('');
        expect(toInput()).toHaveValue('');
    }, 3000);

    it('calls setSomeFieldValues appropriately when typing a date', async () => {
        const user = userEvent.setup();

        render(<DateRangeField field={field} fieldValues={{}} setSomeFieldValues={setSomeFieldValues} />);

        const fromInput = screen.getByText('From').closest('div')?.querySelector('input[type="text"]');
        expect(fromInput).not.toBeNull();

        // Clear any previous calls
        setSomeFieldValues.mockClear();

        // Type a complete date
        await user.type(fromInput!, '20240315');

        // The input should display the formatted date
        expect(fromInput).toHaveValue('2024-03-15');

        // setSomeFieldValues should be called with the date value
        expect(setSomeFieldValues).toHaveBeenCalledWith(
            ['collectionDateRangeLowerFrom', '2024-03-15'],
            ['collectionDateRangeUpperTo', ''],
            ['collectionDateRangeUpperFrom', null],
            ['collectionDateRangeLowerTo', null],
        );
    });
});
