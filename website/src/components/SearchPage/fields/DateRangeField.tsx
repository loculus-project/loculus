import { useMemo, useCallback } from 'react';

import { DateField } from './DateField';
import type { FieldValues, GroupedMetadataFilter, SetSomeFieldValues } from '../../../types/config';
import { CustomTooltip } from '../../../utils/CustomTooltip';

/* ---------- small pure helpers ---------- */

const getBoundField = (
    grouped: GroupedMetadataFilter['groupedFields'],
    bound: 'lower' | 'upper',
    fromTo: 'From' | 'To',
) => grouped.find((f) => f.name.endsWith(fromTo) && f.rangeOverlapSearch!.bound === bound)!;

const pickActiveBounds = (strict: boolean, lowerFrom: string, lowerTo: string, upperFrom: string, upperTo: string) =>
    strict ? { from: lowerFrom, to: upperTo } : { from: upperFrom, to: lowerTo };

/* ---------- the hook that owns the logic ---------- */

function useDateRange(field: GroupedMetadataFilter, fieldValues: FieldValues, setSome: SetSomeFieldValues) {
    // stable references to the four hidden fields
    const bounds = useMemo(() => {
        const g = field.groupedFields;
        return {
            lowerFrom: getBoundField(g, 'lower', 'From'),
            lowerTo: getBoundField(g, 'lower', 'To'),
            upperFrom: getBoundField(g, 'upper', 'From'),
            upperTo: getBoundField(g, 'upper', 'To'),
        };
    }, [field]);

    const strict = useMemo(
        () =>
            (bounds.lowerFrom.name in fieldValues || bounds.upperTo.name in fieldValues) &&
            !(bounds.lowerTo.name in fieldValues) &&
            !(bounds.upperFrom.name in fieldValues),
        [fieldValues, bounds],
    );

    const active = useMemo(
        () =>
            pickActiveBounds(
                strict,
                bounds.lowerFrom.name,
                bounds.lowerTo.name,
                bounds.upperFrom.name,
                bounds.upperTo.name,
            ),
        [strict, bounds],
    );

    // read values directly from the single source of truth
    const fromValue = fieldValues[active.from] ?? '';
    const toValue = fieldValues[active.to] ?? '';

    /* ---- writers --------------------------------------------------------- */

    const writeRange = useCallback(
        (from: string | number | null, to: string | number | null, makeStrict: boolean) => {
            if (makeStrict) {
                setSome(
                    [bounds.lowerFrom.name, from],
                    [bounds.upperTo.name, to],
                    [bounds.upperFrom.name, null],
                    [bounds.lowerTo.name, null],
                );
            } else {
                setSome(
                    [bounds.upperFrom.name, from],
                    [bounds.lowerTo.name, to],
                    [bounds.lowerFrom.name, null],
                    [bounds.upperTo.name, null],
                );
            }
        },
        [bounds, setSome],
    );

    const setFrom = useCallback(
        (value: string | number | null) => writeRange(value, toValue, strict),
        [toValue, strict, writeRange],
    );

    const setTo = useCallback(
        (value: string | number | null) => writeRange(fromValue, value, strict),
        [fromValue, strict, writeRange],
    );

    const toggleStrict = useCallback(
        (checked: boolean) => writeRange(fromValue, toValue, checked),
        [fromValue, toValue, writeRange],
    );

    return { strict, fromValue, toValue, setFrom, setTo, toggleStrict };
}

/* ---------- presentational component ---------- */

export function DateRangeField({
    field,
    fieldValues,
    setSomeFieldValues,
}: {
    field: GroupedMetadataFilter;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
}) {
    const { strict, fromValue, toValue, setFrom, setTo, toggleStrict } = useDateRange(
        field,
        fieldValues,
        setSomeFieldValues,
    );

    return (
        <div className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <div className='flex flex-row justify-between items-baseline mb-2'>
                <h3 className='text-gray-500 text-sm'>{field.displayName}</h3>

                <CustomTooltip id={'strict-tooltip' + field.name}>
                    <div className='w-52'>
                        <p>
                            <b>strict:</b> {field.displayName} range must be <i>entirely</i> inside the search range.
                        </p>
                        <p>
                            <b>not strict:</b> range only needs <i>some overlap</i>.
                        </p>
                    </div>
                </CustomTooltip>

                <label data-tooltip-id={'strict-tooltip' + field.name}>
                    <span className='text-gray-400 text-sm mr-2'>strict</span>
                    <input
                        type='checkbox'
                        className='checkbox checkbox-sm [--chkbg:white] [--chkfg:theme(colors.gray.700)] checked:border-gray-300'
                        checked={strict}
                        onChange={(e) => toggleStrict(e.target.checked)}
                    />
                </label>
            </div>

            <DateField
                field={{ name: `${field.name}-from`, displayName: 'From', type: 'date' }}
                fieldValue={fromValue}
                setValue={setFrom}
            />

            <DateField
                field={{ name: `${field.name}-to`, displayName: 'To', type: 'date' }}
                fieldValue={toValue}
                setValue={setTo}
            />
        </div>
    );
}
