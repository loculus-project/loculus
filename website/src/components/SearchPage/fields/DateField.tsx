import { DatePicker } from '@mui/x-date-pickers';
import { Datepicker } from 'flowbite-react';
import { DateTime } from 'luxon';
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';

type ValueConverter = {
    dateToValueConverter: (date: DateTime | null) => string;
    valueToDateConverter: (value: string) => DateTime | null;
};

export const DateField: FC<FieldProps> = (props) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => date?.toISODate() ?? ''}
        valueToDateConverter={(value) => (value === '' ? null : DateTime.fromISO(value))}
    />
);

export const TimestampField: FC<FieldProps> = (props) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => date?.toSeconds().toString() ?? ''}
        valueToDateConverter={(value) => {
            const timestamp = Number(value);
            return timestamp > 0 ? DateTime.fromSeconds(timestamp) : null;
        }}
    />
);

const CustomizedDatePicker: FC<FieldProps & ValueConverter> = ({
    field,
    handleFieldChange,
    isLoading,
    dateToValueConverter,
    valueToDateConverter,
}) => (
    
    <Datepicker
    defaultDate={ new Date() }
    onSelectedDateChanged={(date) => {
        // return handleFieldChange(field.name, dateToValueConverter(date));
        console.log(date);
    }}
    />
    
);
