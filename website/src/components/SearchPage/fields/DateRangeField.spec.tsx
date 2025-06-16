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

        const fromInput = screen.getByText('From').closest('div')?.querySelector('input');
        const toInput = screen.getByText('To').closest('div')?.querySelector('input');

        expect(fromInput).not.toBeNull();
        expect(toInput).not.toBeNull();

        // Initial values should be displayed
        expect(fromInput).toHaveValue('2024-01-01');
        expect(toInput).toHaveValue('2024-12-31');

        // Clear the from input
        await user.clear(fromInput!);

        // Check that setSomeFieldValues was called with empty string for from field
        expect(setSomeFieldValues).toHaveBeenCalledWith(
            ['collectionDateRangeLowerFrom', ''],
            ['collectionDateRangeUpperTo', '2024-12-31'],
            ['collectionDateRangeUpperFrom', null],
            ['collectionDateRangeLowerTo', null],
        );

        // Clear the to input
        await user.clear(toInput!);

        // Check that setSomeFieldValues was called with empty string for both fields
        expect(setSomeFieldValues).toHaveBeenCalledWith(
            ['collectionDateRangeLowerFrom', ''],
            ['collectionDateRangeUpperTo', ''],
            ['collectionDateRangeUpperFrom', null],
            ['collectionDateRangeLowerTo', null],
        );
    });

    it('updates input values when fieldValues change', async () => {
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
                            setValues(
                                ['collectionDateRangeLowerFrom', '2005-05-05'],
                                ['collectionDateRangeUpperTo', '2010-10-10'],
                            )
                        }
                    >
                        Update Dates
                    </button>
                </div>
            );
        }

        render(<Wrapper />);

        const fromInput = screen.getByText('From').closest('div')?.querySelector('input');
        const toInput = screen.getByText('To').closest('div')?.querySelector('input');
        const button = screen.getByText('Update Dates');

        expect(fromInput).toHaveValue('2024-01-01');
        expect(toInput).toHaveValue('2024-12-31');

        await userEvent.click(button);

        expect(fromInput).toHaveValue('2005-05-05');
        expect(toInput).toHaveValue('2010-10-10');
    }, 3000);
});
