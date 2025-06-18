import { DateTime } from 'luxon';
import type { FC } from 'react';

import DateInput from './DateInput';
import { type MetadataFilter, type SetSomeFieldValues } from '../../../types/config';

type DateFieldProps = {
    field: MetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue: string | number;
};

export const DateField: FC<DateFieldProps> = (props) => (
    <DateInput
        {...props}
        dateToValueConverter={(date) => {
            if (!date) return '';
            const isoDate = DateTime.fromJSDate(date).toISODate();
            return isoDate ?? '';
        }}
        valueToDateConverter={(value) => (value ? DateTime.fromISO(value).toJSDate() : undefined)}
    />
);

export const TimestampField: FC<DateFieldProps> = (props) => {
    const isUpperBound = props.field.name.endsWith('To');

    return (
        <DateInput
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
                const timestamp = parseInt(value, 10);
                if (isNaN(timestamp)) return undefined;
                // The timestamp represents a UTC time. We need to display the UTC date.
                // Create a date from the timestamp
                const utcDate = new Date(timestamp * 1000);
                // Extract UTC components
                const year = utcDate.getUTCFullYear();
                const month = utcDate.getUTCMonth();
                const day = utcDate.getUTCDate();
                // Create a local date with the same year/month/day as the UTC date
                const localDate = new Date(year, month, day);
                return localDate;
            }}
        />
    );
};
