import { DateTime } from 'luxon';
import type { FC } from 'react';
import { DatePicker } from 'rsuite';

import 'rsuite/DatePicker/styles/index.css';
import useClientFlag from '../../../hooks/isClient';
import { type MetadataFilter, type SetSomeFieldValues } from '../../../types/config';

type CustomizedDatePickerProps = {
    field: MetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | undefined;
    fieldValue: string | number;
};

/**
 * Converts a Date object to YYYY-MM-DD string format.
 * Uses native Date methods to extract calendar date components directly.
 * This avoids timezone conversion issues that occur with Luxon's toISODate(),
 * which converts to UTC and can shift dates (e.g., May 7 0010 becomes May 6 0010).
 * Native getFullYear/getMonth/getDate preserve the exact calendar date displayed.
 */
export function dateToISOString(date: Date | null): string {
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
export function isoStringToDate(value: string): Date | undefined {
    if (!value) return undefined;

    const dt = DateTime.fromFormat(value, 'yyyy-MM-dd');
    if (!dt.isValid) return undefined;

    const jsDate = dt.toJSDate();
    // Force to midnight local time to ensure round-trip consistency
    jsDate.setHours(0, 0, 0, 0);
    return jsDate;
}

export const DateField: FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (
    props,
) => <CustomizedDatePicker {...props} dateToValueConverter={dateToISOString} valueToDateConverter={isoStringToDate} />;

export const TimestampField: FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (
    props,
) => {
    const isUpperBound = props.field.name.endsWith('To');

    return (
        <CustomizedDatePicker
            {...props}
            dateToValueConverter={(date) => {
                if (date === null) {
                    return '';
                }
                if (isUpperBound) {
                    date.setHours(23, 59, 59, 999);
                } else {
                    date.setHours(0, 0, 0, 0);
                }
                const localSecondsInUtc = Math.floor(date.getTime() / 1000);
                const utcSeconds = localSecondsInUtc - date.getTimezoneOffset() * 60;
                if (isNaN(utcSeconds)) return '';
                return String(utcSeconds);
            }}
            valueToDateConverter={(value) => {
                const timestamp = Math.max(parseInt(value, 10));
                if (isNaN(timestamp)) return undefined;
                const tzOffset = new Date().getTimezoneOffset() * 60;
                const date = new Date((timestamp + tzOffset) * 1000);
                return date;
            }}
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
    const isClient = useClientFlag();
    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-16 my-3 text-right mr-2 text-gray-400'>
                    {field.displayName ?? field.name}
                </label>
                <DatePicker
                    defaultValue={fieldValue !== '' ? valueToDateConverter(fieldValue.toString()) : undefined}
                    id={field.name}
                    name={field.name}
                    key={field.name}
                    format={'dd/MM/yyyy'}
                    isoWeek={true}
                    oneTap={true}
                    onChange={(date) => {
                        if (date) {
                            setSomeFieldValues([field.name, dateToValueConverter(date)]);
                        } else {
                            setSomeFieldValues([field.name, '']);
                        }
                    }}
                    onClean={() => {
                        setSomeFieldValues([field.name, '']);
                    }}
                    disabled={!isClient}
                />
            </div>
        </div>
    );
};
