import { useEffect, useState } from 'react';

import { DateField } from './DateField';
import type { FieldValues, GroupedMetadataFilter, SetSomeFieldValues } from '../../../types/config';
import { CustomTooltip } from '../../../utils/CustomTooltip';

export type DateRangeFieldProps = {
    field: GroupedMetadataFilter;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
};

const TOOLTIP_TEXT =
    'In strict mode the collection range must be entirely in the search range. ' +
    'If strict mode is disabled, a partial overlap of collection range and search range is sufficient.';

/**
 * Whether to use strict mode or not is defined based on the fields that are given.
 * `undefined` is returned if an ambiguous combiation of fields is defined.
 */
function isStrictMode(
    lowerFromDefined: boolean,
    lowerToDefined: boolean,
    upperFromDefined: boolean,
    upperToDefined: boolean,
) {
    if (lowerFromDefined && upperToDefined && !lowerToDefined && !upperFromDefined) {
        return true;
    } else if (lowerToDefined && upperFromDefined && !lowerFromDefined && !upperToDefined) {
        return false;
    } else if (!lowerFromDefined && !upperToDefined && !lowerToDefined && !upperFromDefined) {
        return true; // if nothing is defined, default to strict
    } else {
        // a weird combination of parameters are set, can't determine mode
        return true; // TODO not sure how to handle error maybe? wanted to return undefined here ...
    }
}

export const DateRangeField = ({ field, fieldValues, setSomeFieldValues }: DateRangeFieldProps) => {
    const lowerFromField = field.groupedFields.filter(
        (f) => f.name.endsWith('From') && f.rangeOverlapSearch!.bound === 'lower',
    )[0];
    const lowerToField = field.groupedFields.filter(
        (f) => f.name.endsWith('To') && f.rangeOverlapSearch!.bound === 'lower',
    )[0];
    const upperFromField = field.groupedFields.filter(
        (f) => f.name.endsWith('From') && f.rangeOverlapSearch!.bound === 'upper',
    )[0];
    const upperToField = field.groupedFields.filter(
        (f) => f.name.endsWith('To') && f.rangeOverlapSearch!.bound === 'upper',
    )[0];
    // TODO maybe all these '!' should be handled differently?

    const [strictMode, setStrictMode] = useState(
        isStrictMode(
            lowerFromField.name in fieldValues,
            lowerToField.name in fieldValues,
            upperFromField.name in fieldValues,
            upperToField.name in fieldValues,
        ),
    );

    const lowerField = strictMode ? lowerFromField : upperFromField;
    const upperField = strictMode ? upperToField : lowerToField;

    const [lowerValue, setLowerValue] = useState(fieldValues[lowerField.name] ?? '');
    const [upperValue, setUpperValue] = useState(fieldValues[upperField.name] ?? '');

    useEffect(() => {
        if (strictMode) {
            setSomeFieldValues({
                [lowerFromField.name]: lowerValue,
                [upperToField.name]: upperValue,
                [upperFromField.name]: null,
                [lowerToField.name]: null,
            });
        } else {
            setSomeFieldValues({
                [upperFromField.name]: lowerValue,
                [lowerToField.name]: upperValue,
                [lowerFromField.name]: null,
                [upperToField.name]: null,
            });
        }
    }, [
        strictMode,
        lowerValue,
        upperValue,
        lowerFromField,
        lowerToField,
        upperFromField,
        upperToField,
        setSomeFieldValues,
    ]);

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <div className='flex flex-row justify-between items-baseline mb-2'>
                <h3 className='text-gray-500 text-sm'>{field.displayName}</h3>
                <CustomTooltip id={'strict-tooltip' + field.name}>
                    <div className='w-52'>{TOOLTIP_TEXT}</div>
                </CustomTooltip>
                <label data-tooltip-id={'strict-tooltip' + field.name}>
                    <span className='text-gray-400 text-sm mr-2'>strict</span>
                    <input
                        type='checkbox'
                        className='checkbox checkbox-sm [--chkbg:theme(colors.gray.400)]'
                        checked={strictMode}
                        onChange={(event) => setStrictMode(event.target.checked)}
                    />
                </label>
            </div>

            <DateField
                field={{
                    name: 'not used',
                    label: 'From',
                    type: 'date',
                }}
                fieldValue={lowerValue}
                setAFieldValue={(_, value) => setLowerValue(value!)}
            />
            <DateField
                field={{
                    name: 'not used',
                    label: 'To',
                    type: 'date',
                }}
                fieldValue={upperValue}
                setAFieldValue={(_, value) => setUpperValue(value!)}
            />
        </div>
    );
};
