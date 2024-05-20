import { DateTime } from 'luxon';
import { DatePicker } from 'rsuite';
import 'rsuite/DatePicker/styles/index.css';
import {type MetadataFilter } from '../../../types/config';


type CustomizedDatePickerProps = {
    field: MetadataFilter;
    setAFieldValue: (name: string, value: string) => void;
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | undefined;
    fieldValue: string;
};

export const DateField: React.FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (props) => (
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

export const TimestampField: React.FC<Omit<CustomizedDatePickerProps, 'dateToValueConverter' | 'valueToDateConverter'>> = (props) => (
    <CustomizedDatePicker
        {...props}
        dateToValueConverter={(date) => (date ? String(Math.floor(date.getTime() / 1000)) : '')}
        valueToDateConverter={(value) => {
            const timestamp = Math.max(parseInt(value, 10));    
            return isNaN(timestamp) ? undefined : new Date(timestamp * 1000);
        }}
    />
);

const CustomizedDatePicker: React.FC<CustomizedDatePickerProps> = ({ field, setAFieldValue, dateToValueConverter, valueToDateConverter, fieldValue }) => {
    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-10 my-3 text-right mr-2 text-gray-400'>
                    {field.label}
                </label>
                <DatePicker
                    name={field.name}
                    value={fieldValue ? valueToDateConverter(fieldValue) : undefined}
                    key={field.name}
                    onChange={(date) => {
                        if (date) {
                            setAFieldValue(field.name, dateToValueConverter(date));
                        } else {
                            setAFieldValue(field.name, '');
                        }
                    }}
                    onClean={() => {
                        setAFieldValue(field.name, '');
                    }}
                />
            </div>
        </div>
    );
};
