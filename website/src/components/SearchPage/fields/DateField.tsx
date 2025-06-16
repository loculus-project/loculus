import { DateTime } from 'luxon';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';

import useClientFlag from '../../../hooks/isClient';
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
    <CustomizedDateInput
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
) => {
    const isUpperBound = props.field.name.endsWith('To');

    return (
        <CustomizedDateInput
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

const CustomizedDateInput: FC<CustomizedDatePickerProps> = ({
    field,
    setSomeFieldValues,
    dateToValueConverter,
    valueToDateConverter,
    fieldValue,
}) => {
    const isClient = useClientFlag();
    const mask = 'YYYY-MM-DD';
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLInputElement>(null);
    const dateValue = fieldValue !== '' ? valueToDateConverter(fieldValue.toString()) : undefined;
    const [inputValue, setInputValue] = useState(
        dateValue ? (DateTime.fromJSDate(dateValue).toISODate() ?? mask) : mask,
    );

    useEffect(() => {
        if (fieldValue === '') {
            setInputValue(mask);
        } else if (dateValue) {
            setInputValue(DateTime.fromJSDate(dateValue).toISODate() ?? mask);
        }
    }, [fieldValue, dateValue]);

    const setCursor = (digits: number) => {
        const el = inputRef.current;
        if (!el) return;
        if (digits < 4) {
            el.setSelectionRange(digits, 4);
        } else if (digits < 6) {
            el.setSelectionRange(5 + digits - 4, 7);
        } else if (digits < 8) {
            el.setSelectionRange(8 + digits - 6, 10);
        } else {
            el.setSelectionRange(10, 10);
        }
    };

    const handleFocus = () => {
        if (inputValue === mask) {
            setCursor(0);
        } else {
            const digits = inputValue.replace(/\D/g, '').length;
            setCursor(digits);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
        const year = digits.slice(0, 4).padEnd(4, 'Y');
        const month = digits.slice(4, 6).padEnd(2, 'M');
        const day = digits.slice(6, 8).padEnd(2, 'D');
        const formatted = `${year}-${month}-${day}`;
        setInputValue(formatted);
        setCursor(digits.length);

        if (digits.length === 8) {
            const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
            const dt = DateTime.fromISO(iso);
            if (dt.isValid) {
                setSomeFieldValues([field.name, dateToValueConverter(dt.toJSDate())]);
            } else {
                setSomeFieldValues([field.name, '']);
            }
        } else {
            setSomeFieldValues([field.name, '']);
        }
    };

    const openPicker = () => {
        const el = pickerRef.current;
        if (el) {
            if (typeof el.showPicker === 'function') {
                el.showPicker();
            } else {
                el.focus();
            }
        }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value) {
            setInputValue(value);
            setSomeFieldValues([field.name, dateToValueConverter(new Date(value))]);
        } else {
            setInputValue(mask);
            setSomeFieldValues([field.name, '']);
        }
    };

    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-16 my-3 text-right mr-2 text-gray-400'>
                    {field.displayName ?? field.name}
                </label>
                <div className='flex items-center'>
                    <input
                        ref={inputRef}
                        type='text'
                        id={field.name}
                        name={field.name}
                        value={inputValue}
                        onChange={handleChange}
                        onFocus={handleFocus}
                        disabled={!isClient}
                        className='input input-sm w-32'
                    />
                    <button
                        type='button'
                        onClick={openPicker}
                        disabled={!isClient}
                        className='ml-2 border rounded px-2'
                        aria-label={`Open ${field.displayName ?? field.name} picker`}
                    >
                        📅
                    </button>
                    <input type='date' ref={pickerRef} onChange={handleDateChange} className='hidden' />
                </div>
            </div>
        </div>
    );
};
