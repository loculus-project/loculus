import { useEffect, useState } from 'react';

import { DateField } from './DateField';
import type { FieldValues, GroupedMetadataFilter, SetSomeFieldValues } from '../../../types/config';
import { CustomTooltip } from '../../../utils/CustomTooltip';
import { validateSingleValue } from '../../../utils/extractFieldValue';
import { Checkbox } from '../../common/Checkbox';

export type DateRangeFieldProps = {
    field: GroupedMetadataFilter;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
};

/**
 * Whether to use strict mode or not is defined based on the fields that are given.
 * `true` is returned if an ambiguous combination of fields is defined.
 */
function isStrictMode(
    lowerFromDefined: boolean,
    lowerToDefined: boolean,
    upperFromDefined: boolean,
    upperToDefined: boolean,
) {
    if ((lowerFromDefined || upperToDefined) && !lowerToDefined && !upperFromDefined) {
        return true;
    } else if ((lowerToDefined || upperFromDefined) && !lowerFromDefined && !upperToDefined) {
        return false;
    } else {
        return true; // default to true if the inputs don't make sense
    }
}

export const DateRangeField = ({ field, fieldValues, setSomeFieldValues }: DateRangeFieldProps) => {
    // the DateRangeField expects 4 fields in groupedFields and they should all have rangeOverlapSearch defined
    const getField = (bound: string, fromTo: string) =>
        field.groupedFields.find((f) => f.name.endsWith(fromTo) && f.rangeOverlapSearch!.bound === bound)!;
    const lowerFromField = getField('lower', 'From');
    const lowerToField = getField('lower', 'To');
    const upperFromField = getField('upper', 'From');
    const upperToField = getField('upper', 'To');

    const lowerFromDefined = lowerFromField.name in fieldValues;
    const lowerToDefined = lowerToField.name in fieldValues;
    const upperFromDefined = upperFromField.name in fieldValues;
    const upperToDefined = upperToField.name in fieldValues;

    const [strictMode, setStrictMode] = useState(
        isStrictMode(lowerFromDefined, lowerToDefined, upperFromDefined, upperToDefined),
    );

    // Keep strictMode in sync when the underlying fieldValues change from outside the component
    // (e.g. URL navigation or the active-filter pills). We only re-derive when at least one bound
    // is actually defined: when the user toggles strictness without having entered any dates we
    // clear all four fields, which would otherwise feed back into isStrictMode and collapse
    // strictMode back to its default `true` — making the checkbox appear stuck on.
    useEffect(() => {
        if (lowerFromDefined || lowerToDefined || upperFromDefined || upperToDefined) {
            setStrictMode(isStrictMode(lowerFromDefined, lowerToDefined, upperFromDefined, upperToDefined));
        }
    }, [lowerFromDefined, lowerToDefined, upperFromDefined, upperToDefined]);

    const lowerField = strictMode ? lowerFromField : upperFromField;
    const upperField = strictMode ? upperToField : lowerToField;

    // Extract single values from fieldValues (date ranges should never be arrays).
    // The displayed values are derived directly from `fieldValues` — the single source of truth —
    // rather than mirrored into local state. Keeping a local copy that is continuously written back
    // and forth with `fieldValues` caused a race: while typing, `fieldValues` lags one round-trip
    // behind (each keystroke goes through setSomeFieldValues -> URL state -> re-derived fieldValues),
    // so a stale `fieldValues` could overwrite a freshly typed value, making the field bounce
    // between two values.
    const getFieldValue = (fieldName: string): string => {
        return validateSingleValue(fieldValues[fieldName], fieldName);
    };

    const lowerValue = getFieldValue(lowerField.name);
    const upperValue = getFieldValue(upperField.name);

    // Write the lower/upper values into the underlying fields for the given mode, clearing the
    // fields that belong to the other mode. This only runs in response to real user interaction
    // (typing a date or toggling strictness), never from an effect, so there is no feedback loop.
    const commit = (strict: boolean, newLowerValue: string, newUpperValue: string) => {
        if (strict) {
            setSomeFieldValues(
                [lowerFromField.name, newLowerValue],
                [upperToField.name, newUpperValue],
                [upperFromField.name, null],
                [lowerToField.name, null],
            );
        } else {
            setSomeFieldValues(
                [upperFromField.name, newLowerValue],
                [lowerToField.name, newUpperValue],
                [lowerFromField.name, null],
                [upperToField.name, null],
            );
        }
    };

    const handleStrictToggle = (strict: boolean) => {
        setStrictMode(strict);
        commit(strict, lowerValue, upperValue);
    };

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <div className='flex flex-row justify-between items-baseline mb-2'>
                <h3 className='text-gray-500 text-sm'>{field.displayName}</h3>
                <CustomTooltip id={'strict-tooltip' + field.name}>
                    <div className='w-52'>
                        <p>
                            <span className='font-bold'>strict: </span>
                            {field.displayName} range must be <span className='italic'>entirely </span>
                            inside of the search range.
                        </p>
                        <p>
                            <span className='font-bold'>not strict: </span>
                            {field.displayName} range must have <span className='italic'>some overlap </span>
                            with the search range.
                        </p>
                    </div>
                </CustomTooltip>
                <label data-tooltip-id={'strict-tooltip' + field.name}>
                    <span className='text-gray-400 text-sm mr-2'>strict</span>
                    <Checkbox
                        size='sm'
                        outline
                        className='checked:border-gray-300'
                        checked={strictMode}
                        onChange={(event) => handleStrictToggle(event.target.checked)}
                    />
                </label>
            </div>

            <DateField
                field={{
                    name: `${field.name}-from`,
                    displayName: 'From',
                    type: 'date',
                }}
                fieldValue={lowerValue}
                setSomeFieldValues={([_, value]) => {
                    // DateField passes a single tuple [fieldName, value]
                    const validatedValue = validateSingleValue(value, `${field.name}-from`);
                    commit(strictMode, validatedValue, upperValue);
                }}
            />
            <DateField
                field={{
                    name: `${field.name}-to`,
                    displayName: 'To',
                    type: 'date',
                }}
                fieldValue={upperValue}
                setSomeFieldValues={([_, value]) => {
                    // DateField passes a single tuple [fieldName, value]
                    const validatedValue = validateSingleValue(value, `${field.name}-to`);
                    commit(strictMode, lowerValue, validatedValue);
                }}
            />
        </div>
    );
};
