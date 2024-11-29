import { useState } from 'react';

import { DateField } from './DateField';
import type { FieldValues, GroupedMetadataFilter, SetAFieldValue } from '../../../types/config';

export type DateRangeFieldProps = {
    field: GroupedMetadataFilter;
    fieldValues: FieldValues;
    setAFieldValue: SetAFieldValue;
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
    } else {
        return undefined;
    }
}

export const DateRangeField = ({ field, fieldValues, setAFieldValue }: DateRangeFieldProps) => {
    const lowerFromField = field.groupedFields.filter(
        (f) => f.label!.endsWith('From') && f.rangeOverlapSearch!.bound === 'lower',
    )[0];
    const lowerToField = field.groupedFields.filter(
        (f) => f.label!.endsWith('To') && f.rangeOverlapSearch!.bound === 'lower',
    )[0];
    const upperFromField = field.groupedFields.filter(
        (f) => f.label!.endsWith('From') && f.rangeOverlapSearch!.bound === 'upper',
    )[0];
    const upperToField = field.groupedFields.filter(
        (f) => f.label!.endsWith('To') && f.rangeOverlapSearch!.bound === 'upper',
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

    if (strictMode === undefined) {
        // raise error TODO
        return;
    }

    const lowerField = strictMode ? lowerFromField : upperToField;
    const upperField = strictMode ? upperToField : lowerFromField;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setStrictMode(event.target.checked);
    };

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <h3 className='text-gray-500 text-sm mb-1'>{field.displayName}</h3>

            <label>
                <input type='checkbox' checked={strictMode} onChange={handleChange} />
                Strict Mode
            </label>

            <DateField
                field={lowerField}
                fieldValue={fieldValues[lowerField.name] ?? ''}
                setAFieldValue={setAFieldValue}
            />
            <DateField
                field={upperField}
                fieldValue={fieldValues[upperField.name] ?? ''}
                setAFieldValue={setAFieldValue}
            />
        </div>
    );
};
