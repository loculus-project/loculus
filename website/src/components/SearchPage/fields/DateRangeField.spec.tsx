import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState, type ReactNode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DateRangeField } from './DateRangeField';
import { type GroupedMetadataFilter, type FieldValues, type SetSomeFieldValues } from '../../../types/config';
import { Button } from '../../common/Button';

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

    /**
     * Renders DateRangeField wired to real React state instead of a `vi.fn()` mock.
     *
     * A plain `vi.fn()` can't catch the bug these tests guard against: DateRangeField shows
     * whatever is in its `fieldValues` prop, so a value can only "bounce" if edits actually feed
     * back into that prop on the next render. A mock never updates it, so the field would appear to
     * work even with the buggy two-way mirror. This harness mimics production
     * `useSearchPageState.setSomeFieldValues` (null/'' deletes the key), so typed edits round-trip
     * through `fieldValues` exactly as they do in the app.
     *
     * Pass `valuesRef` to observe the latest state, and `children` to render extra controls (e.g. a
     * button that clears the fields externally).
     */
    function StatefulDateRangeField({
        initialValues = {},
        valuesRef,
        children,
    }: {
        initialValues?: FieldValues;
        valuesRef?: { current: FieldValues };
        children?: (setSomeFieldValues: SetSomeFieldValues) => ReactNode;
    }) {
        const [values, setValues] = useState<FieldValues>(initialValues);
        if (valuesRef) valuesRef.current = values;

        const setValuesLikeProduction: SetSomeFieldValues = useCallback((...fieldValuesToSet) => {
            setValues((state) => {
                const newState = { ...state };
                fieldValuesToSet.forEach(([key, value]) => {
                    if (value === null || value === '') {
                        delete newState[key];
                    } else {
                        newState[key] = value;
                    }
                });
                return newState;
            });
        }, []);

        return (
            <>
                <DateRangeField field={field} fieldValues={values} setSomeFieldValues={setValuesLikeProduction} />
                {children?.(setValuesLikeProduction)}
            </>
        );
    }

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

    it('does not write to query params on mount', () => {
        render(
            <DateRangeField
                field={field}
                fieldValues={{ collectionDateRangeLowerFrom: '2024-01-01', collectionDateRangeUpperTo: '2024-12-31' }}
                setSomeFieldValues={setSomeFieldValues}
            />,
        );

        // Rendering must not push values back into query state — avoids the feedback loop that
        // made the inputs bounce between two values while typing.
        expect(setSomeFieldValues).not.toHaveBeenCalled();
    });

    it('derives switches mode correctly', async () => {
        render(
            <DateRangeField
                field={field}
                fieldValues={{ collectionDateRangeLowerFrom: '2024-01-01', collectionDateRangeUpperTo: '2024-12-31' }}
                setSomeFieldValues={setSomeFieldValues}
            />,
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
        const lastValues: { current: FieldValues } = { current: {} };

        render(
            <StatefulDateRangeField
                initialValues={{
                    collectionDateRangeLowerFrom: '2024-01-01',
                    collectionDateRangeUpperTo: '2024-12-31',
                }}
                valuesRef={lastValues}
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

        // The edits to both fields are retained — neither value bounces back to its previous value.
        expect(lastValues.current).toEqual({
            collectionDateRangeLowerFrom: '1987-04-23',
            collectionDateRangeUpperTo: '2014-10-13',
        });
    });

    it('does not snap back to strict when user toggles without having entered dates', async () => {
        const user = userEvent.setup();
        render(<StatefulDateRangeField />);

        const strictCheckbox = screen.getByRole('checkbox');
        expect(strictCheckbox).toBeChecked();

        await user.click(strictCheckbox);
        expect(strictCheckbox).not.toBeChecked();
    });

    it('setting fieldValue to empty string clears date field', async () => {
        const user = userEvent.setup();

        render(
            <StatefulDateRangeField
                initialValues={{
                    collectionDateRangeLowerFrom: '2024-01-01',
                    collectionDateRangeUpperTo: '2024-12-31',
                }}
            >
                {(setSomeFieldValues) => (
                    <Button
                        onClick={() =>
                            setSomeFieldValues(
                                ['collectionDateRangeLowerFrom', null],
                                ['collectionDateRangeUpperTo', null],
                            )
                        }
                    >
                        Update Dates
                    </Button>
                )}
            </StatefulDateRangeField>,
        );

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
