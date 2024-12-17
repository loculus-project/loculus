import { DateTime } from 'luxon';
import type { FC } from 'react';
import { DatePicker } from 'rsuite';

import 'rsuite/DatePicker/styles/index.css';
import { type MetadataFilter, type SetSomeFieldValues } from '../../../types/config';

type CustomizedDatePickerProps = {
    field: MetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | undefined;
    fieldValue: string | number;
};

export const DateField: FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (
    props,
) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => {
            if (!date) return '';
            const isoDate = DateTime.fromJSDate(date).toISODate();
            return isoDate ?? '';
        }}
        valueToDateConverter={(value) => (value ? DateTime.fromISO(value).toJSDate() : undefined)}
    />
);

export const TimestampField: FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (
    props,
) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => {
            const initialValue = date ? String(Math.floor(date.getTime() / 1000)) : '';
            if (initialValue === 'NaN') {
                return '';
            } else {
                return initialValue;
            }
        }}
        valueToDateConverter={(value) => {
            const timestamp = Math.max(parseInt(value, 10));
            return isNaN(timestamp) ? undefined : new Date(timestamp * 1000);
        }}
    />
);

const CustomizedDatePicker: FC<CustomizedDatePickerProps> = ({
    field,
    setSomeFieldValues,
    dateToValueConverter,
    valueToDateConverter,
    fieldValue,
}) => {
    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-16 my-3 text-right mr-2 text-gray-400'>
                    {field.label}
                </label>
                <DatePicker
                    name={field.name}
                    defaultValue={fieldValue !== '' ? valueToDateConverter(fieldValue.toString()) : undefined}
                    key={field.name}
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
                />
            </div>
        </div>
    );
};
