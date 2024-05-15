import { DateTime } from 'luxon';
import type { FC } from 'react';
import { DatePicker } from 'rsuite';

import 'rsuite/DatePicker/styles/index.css';

type ValueConverter = {
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | undefined;
};

export const DateField = (props) => (
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

export const TimestampField = (props) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => (date ? String(Math.floor(date.getTime() / 1000)) : '')}
        valueToDateConverter={(value) => {
            const timestamp = parseInt(value, 10);
            return isNaN(timestamp) ? undefined : new Date(timestamp * 1000);
        }}
    />
);

const CustomizedDatePicker = ({
    field,
    setAFieldValue,
    dateToValueConverter,
    valueToDateConverter,
    fieldValue,
}) => {
    console.log('fieldValue', fieldValue, field, valueToDateConverter(fieldValue));
    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm  w-10 my-3 text-right mr-2 text-gray-400'>
                    {field.label}
                </label>
                <DatePicker
                    
                    name={field.name}
                    value={fieldValue ? valueToDateConverter(fieldValue) : undefined}

                   
                    onChange={(value) => {
                        if (value && isNaN(value.getTime())) {
                            return;
                        }
                        setAFieldValue(field.name, dateToValueConverter(value));
                    }}
                    onChangeCalendarDate={(value) => {
                        setAFieldValue(field.name, dateToValueConverter(value));
                    }}
                    onClean={() => {
                        setAFieldValue(field.name, '');
                    }}
                />
            </div>
        </div>
    );
};
