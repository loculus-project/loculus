import { useEffect, useState } from 'react';

import { DateField } from './DateField';
import type { FieldValues, GroupedMetadataFilter, SetSomeFieldValues } from '../../../types/config';
import { CustomTooltip } from '../../../utils/CustomTooltip';

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
    } else {
        return undefined;
    }
}

export const DateRangeField = ({ field, fieldValues, setSomeFieldValues }: DateRangeFieldProps) => {
    // the DateRangeField expects 4 fields in groupedFields and they should all have rangeOverlapSearch defined
    const getField = (bound: string, fromTo: string) =>
        field.groupedFields.filter((f) => f.name.endsWith(fromTo) && f.rangeOverlapSearch!.bound === bound)[0];
    const lowerFromField = getField('lower', 'From');
    const lowerToField = getField('lower', 'To');
    const upperFromField = getField('upper', 'From');
    const upperToField = getField('upper', 'To');

    const [strictMode, setStrictMode] = useState(true);

    // handle query param definitions/changes
    useEffect(() => {
        const useStrictMode = isStrictMode(
            lowerFromField.name in fieldValues,
            lowerToField.name in fieldValues,
            upperFromField.name in fieldValues,
            upperToField.name in fieldValues,
        );
        if (useStrictMode !== undefined) {
            setStrictMode(useStrictMode);
        }
    }, [fieldValues, lowerFromField, lowerToField, upperFromField, upperToField]);

    const lowerField = strictMode ? lowerFromField : upperFromField;
    const upperField = strictMode ? upperToField : lowerToField;
    const [lowerValue, setLowerValue] = useState(fieldValues[lowerField.name] ?? '');
    const [upperValue, setUpperValue] = useState(fieldValues[upperField.name] ?? '');

    useEffect(() => {
        if (strictMode) {
            setSomeFieldValues(
                [lowerFromField.name, lowerValue],
                [upperToField.name, upperValue],
                [upperFromField.name, null],
                [lowerToField.name, null],
            );
        } else {
            setSomeFieldValues(
                [upperFromField.name, lowerValue],
                [lowerToField.name, upperValue],
                [lowerFromField.name, null],
                [upperToField.name, null],
            );
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
                    <input
                        type='checkbox'
                        className='checkbox checkbox-sm text-3xl [--chkbg:white] [--chkfg:theme(colors.gray.700)] checked:border-gray-300'
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
                setSomeFieldValues={(args) => setLowerValue(args[1]!)}
            />
            <DateField
                field={{
                    name: 'not used',
                    label: 'To',
                    type: 'date',
                }}
                fieldValue={upperValue}
                setSomeFieldValues={(args) => setUpperValue(args[1]!)}
            />
        </div>
    );
};
