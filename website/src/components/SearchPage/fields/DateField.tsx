import { DateTime } from 'luxon';
import type { FC } from 'react';
import { DatePicker } from 'rsuite';

import type { FieldProps } from './FieldProps';
import 'rsuite/DatePicker/styles/index.css';

type ValueConverter = {
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | undefined;
};

export const DateField: FC<FieldProps> = (props) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => {
            if (!date) return '';
            const isoDate = DateTime.fromJSDate(date).toISODate();
            return isoDate !== null ? isoDate : '';
        }}
        valueToDateConverter={(value) => (value ? DateTime.fromISO(value).toJSDate() : undefined)}
    />
);

export const TimestampField: FC<FieldProps> = (props) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => (date ? String(Math.floor(date.getTime() / 1000)) : '')}
        valueToDateConverter={(value) => {
            const timestamp = parseInt(value, 10);
            return isNaN(timestamp) ? undefined : new Date(timestamp * 1000);
        }}
    />
);

const CustomizedDatePicker: FC<FieldProps & ValueConverter> = ({
    field,
    handleFieldChange,
    dateToValueConverter,
    valueToDateConverter,
}) => {
    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm  w-10 my-3 text-right mr-2 text-gray-400'>
                    {field.label}
                </label>
                <DatePicker
                    name={field.name}
                    placeholder='yyyy-mm-dd'
                    defaultValue={field.filterValue ? valueToDateConverter(field.filterValue) : undefined}
                    onChange={(value) => {
                        if (value && isNaN(value.getTime())) {
                            return;
                        }
                        handleFieldChange(field.name, dateToValueConverter(value));
                    }}
                    onChangeCalendarDate={(value) => {
                        handleFieldChange(field.name, dateToValueConverter(value));
                    }}
                    onClean={() => {
                        handleFieldChange(field.name, '');
                    }}
                />
            </div>
        </div>
    );
};
