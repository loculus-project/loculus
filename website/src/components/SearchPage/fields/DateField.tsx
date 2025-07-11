import { DateTime } from 'luxon';
import { useEffect, useRef, useState, type FC } from 'react';
import { DatePicker } from 'rsuite';

import 'rsuite/DatePicker/styles/index.css';
import { type MetadataFilter, type SetSomeFieldValues } from '../../../types/config';
import DisabledUntilHydrated from '../../DisabledUntilHydrated';

type CustomizedDatePickerProps = {
    field: MetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | null;
    fieldValue: string | number;
};

/**
 * Converts a Date object to YYYY-MM-DD string format.
 * Uses native Date methods to extract calendar date components directly.
 * This avoids timezone conversion issues that occur with Luxon's toISODate(),
 * which converts to UTC and can shift dates (e.g., May 7 0010 becomes May 6 0010).
 * Native getFullYear/getMonth/getDate preserve the exact calendar date displayed.
 */
export function jsDateToISOString(date: Date | null): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Converts a YYYY-MM-DD string to a Date object.
 * Uses Luxon's robust validation via fromFormat instead of fromISO
 * to avoid timezone interpretation issues. fromFormat treats the
 * input as a local date without timezone conversion.
 * Forces result to midnight local time to ensure round-trip consistency.
 * Historical timezones (like GMT+0034 in year 0010) can cause
 * Luxon to create dates with slight time offsets (e.g., 8 seconds).
 * Setting to midnight ensures we get back exactly what rsuite gave us.
 */
export function isoStringToJsDate(value: string): Date | null {
    if (!value) return null;

    const dt = DateTime.fromFormat(value, 'yyyy-MM-dd');
    if (!dt.isValid) return null;

    const jsDate = dt.toJSDate();
    // Force to midnight local time to ensure round-trip consistency
    jsDate.setHours(0, 0, 0, 0);
    return jsDate;
}

/**
 * Converts Date to UTC timestamp treating local calendar components as UTC.
 * E.g., local "2023-03-04 14:30" becomes timestamp for "2023-03-04 14:30 UTC".
 * This ignores actual timezone info to ensure consistent round-trip behavior.
 * Note: Years < 100 not supported (would be misinterpreted by Date constructor).
 */
export function jsDateToTimestamp(date: Date | null, isUpperBound: boolean): string {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return '';
    }

    // Extract displayed calendar components
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const [hours, minutes, seconds, ms] = isUpperBound ? [23, 59, 59, 999] : [0, 0, 0, 0];

    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms));
    if (isNaN(utcDate.getTime())) return '';

    return String(Math.floor(utcDate.getTime() / 1000));
}

/**
 * Converts UTC timestamp back to Date with UTC components as local components.
 * Reverses the "local as UTC" conversion for round-trip consistency.
 */
export function timestampToJsDate(value: string): Date | null {
    if (!value) return null;

    const timestamp = parseInt(value, 10);
    if (isNaN(timestamp)) return null;

    const utcDate = new Date(timestamp * 1000);
    if (isNaN(utcDate.getTime())) return null;

    // Use UTC components as local components
    const localDate = new Date(
        utcDate.getUTCFullYear(),
        utcDate.getUTCMonth(),
        utcDate.getUTCDate(),
        utcDate.getUTCHours(),
        utcDate.getUTCMinutes(),
        utcDate.getUTCSeconds(),
        utcDate.getUTCMilliseconds(),
    );

    return isNaN(localDate.getTime()) ? null : localDate;
}

export const DateField: FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (
    props,
) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={jsDateToISOString}
        valueToDateConverter={isoStringToJsDate}
    />
);

export const TimestampField: FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (
    props,
) => {
    const isUpperBound = props.field.name.endsWith('To');

    return (
        <CustomizedDatePicker
            {...props}
            dateToValueConverter={(date) => jsDateToTimestamp(date, isUpperBound)}
            valueToDateConverter={(timestamp) => timestampToJsDate(timestamp)}
        />
    );
};

const CustomizedDatePicker: FC<CustomizedDatePickerProps> = ({
    field,
    setSomeFieldValues,
    dateToValueConverter,
    valueToDateConverter,
    fieldValue,
}) => {
    /**
     * Using DatePicker with controlled value causes issues:
     * - it misbehaves on typing when LAPIS errors, e.g. on out-of-range integers
     * - it can get stuck when pressing keyup/down for a few seconds
     * Hence, we're using it as an uncontrolled component with a key that forces remounts
     * when the fieldValue changes from non-emtpy to empty - but only when the change
     * is not triggered by interaction with the DatePicker itself.
     **/
    const [resetKey, setResetKey] = useState(0);
    const lastWasEmpty = useRef(true);
    const internalClear = useRef(false);

    useEffect(() => {
        const isEmpty = fieldValue === '';

        // Remount only on non‑empty → empty *and* when not internally cleared
        if (isEmpty && !lastWasEmpty.current && !internalClear.current) {
            setResetKey((k) => k + 1);
        }

        lastWasEmpty.current = isEmpty;
        internalClear.current = false;
    }, [fieldValue]);

    const defaultDate = fieldValue !== '' ? valueToDateConverter(String(fieldValue)) : null;

    const handleChange = (date: Date | null) => {
        const converted = dateToValueConverter(date);
        if (converted === '') internalClear.current = true;
        setSomeFieldValues([field.name, converted]);
    };

    const handleClean = () => {
        internalClear.current = true;
        setSomeFieldValues([field.name, '']);
    };

    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-16 my-3 text-right mr-2 text-gray-400'>
                    {field.displayName ?? field.name}
                </label>
                <DisabledUntilHydrated>
                    <DatePicker
                        format='yyyy-MM-dd'
                        defaultValue={defaultDate}
                        id={field.name}
                        name={field.name}
                        key={resetKey}
                        isoWeek
                        oneTap
                        onChange={handleChange}
                        onClean={handleClean}
                    />
                </DisabledUntilHydrated>
            </div>
        </div>
    );
};
