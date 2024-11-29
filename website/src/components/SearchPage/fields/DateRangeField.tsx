import { useEffect, useState } from 'react';

import { DateField } from './DateField';
import type { FieldValues, GroupedMetadataFilter, SetSomeFieldValues } from '../../../types/config';

export type DateRangeFieldProps = {
    field: GroupedMetadataFilter;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
};

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
            <h3 className='text-gray-500 text-sm mb-1'>{field.displayName}</h3>

            <label>
                <input type='checkbox' checked={strictMode} onChange={(event) => setStrictMode(event.target.checked)} />
                Strict Mode
            </label>

            <DateField
                field={{
                    name: 'not used',
                    label: 'Lower',
                    type: 'date',
                }}
                fieldValue={lowerValue}
                setAFieldValue={(_, value) => setLowerValue(value!)}
            />
            <DateField
                field={{
                    name: 'not used',
                    label: 'Upper',
                    type: 'date',
                }}
                fieldValue={upperValue}
                setAFieldValue={(_, value) => setUpperValue(value!)}
            />
        </div>
    );
};
