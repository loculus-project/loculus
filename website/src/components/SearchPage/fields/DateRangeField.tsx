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

    // Only re-derive strictMode when at least one bound is defined, otherwise toggling strictness
    // with no dates entered would feed back into isStrictMode and snap the checkbox back to `true`.
    useEffect(() => {
        if (lowerFromDefined || lowerToDefined || upperFromDefined || upperToDefined) {
            setStrictMode(isStrictMode(lowerFromDefined, lowerToDefined, upperFromDefined, upperToDefined));
        }
    }, [lowerFromDefined, lowerToDefined, upperFromDefined, upperToDefined]);

    const lowerField = strictMode ? lowerFromField : upperFromField;
    const upperField = strictMode ? upperToField : lowerToField;

    // Derive displayed values directly from `fieldValues` (the single source of truth) instead of
    // mirroring into local state — a local copy synced both ways with the lagging `fieldValues`
    // would let a stale value overwrite a freshly typed one, making the field bounce while typing.
    const getFieldValue = (fieldName: string): string => {
        return validateSingleValue(fieldValues[fieldName], fieldName);
    };

    const lowerValue = getFieldValue(lowerField.name);
    const upperValue = getFieldValue(upperField.name);

    // Write into the underlying fields for the given mode, clearing the other mode's fields. Only
    // called from user interaction, never an effect, so there is no feedback loop.
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
                    commit(strictMode, validateSingleValue(value, `${field.name}-from`), upperValue);
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
                    commit(strictMode, lowerValue, validateSingleValue(value, `${field.name}-to`));
                }}
            />
        </div>
    );
};
