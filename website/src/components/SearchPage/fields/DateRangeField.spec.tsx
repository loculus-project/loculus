import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { Button } from "src/components/common/Button";
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DateRangeField } from './DateRangeField';
import { type GroupedMetadataFilter, type FieldValues, type SetSomeFieldValues } from '../../../types/config';

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

    it('updates query params if user types in new dates', async () => {
        render(
            <DateRangeField
                field={field}
                fieldValues={{ collectionDateRangeLowerFrom: '2024-01-01', collectionDateRangeUpperTo: '2024-12-31' }}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        const fromInput = screen.getByText('From').closest('div')?.querySelector('input');
        const toInput = screen.getByText('To').closest('div')?.querySelector('input');

        expect(fromInput).toHaveValue('2024-01-01');
        expect(toInput).toHaveValue('2024-12-31');

        await userEvent.type(fromInput!, '{backspace}');
        await userEvent.type(fromInput!, '19870423');
        await userEvent.type(toInput!, '{backspace}');
        await userEvent.type(toInput!, '20141013');

        expect(setSomeFieldValues).toHaveBeenLastCalledWith(
            ['collectionDateRangeLowerFrom', '1987-04-23'],
            ['collectionDateRangeUpperTo', '2014-10-13'],
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

            const setValues: SetSomeFieldValues = useCallback((...fieldValuesToSet) => {
                _setValues((state) => {
                    const newState = { ...state };
                    fieldValuesToSet.forEach(([k, v]) => (newState[k] = v));
                    return newState;
                });
            }, []);

            return (
                <div>
                    <DateRangeField field={field} fieldValues={values} setSomeFieldValues={setValues} />
                    <Button
                        onClick={() =>
                            setValues(['collectionDateRangeLowerFrom', null], ['collectionDateRangeUpperTo', null])
                        }
                    >
                        Update Dates
                    </Button>
                </div>
            );
        }

        const user = userEvent.setup();

        render(<Wrapper />);

        const getFromInput = () => screen.getByText('From').closest('div')?.querySelector('input');
        const getToInput = () => screen.getByText('To').closest('div')?.querySelector('input');
        const button = screen.getByText('Update Dates');

        expect(getFromInput()).toHaveValue('2024-01-01');
        expect(getToInput()).toHaveValue('2024-12-31');

        await user.click(button);

        expect(getFromInput()).toHaveValue('');
        expect(getToInput()).toHaveValue('');
    }, 3000);
});
