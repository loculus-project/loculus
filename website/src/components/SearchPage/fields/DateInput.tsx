import { DateTime } from 'luxon';
import type { FC } from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import React from 'react';
import useClientFlag from '../../../hooks/isClient';
import { type MetadataFilter, type SetSomeFieldValues } from '../../../types/config';
import Calendar from '~icons/ic/baseline-calendar-today';

type DateInputProps = {
    field: MetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    dateToValueConverter: (date: Date | null) => string;
    valueToDateConverter: (value: string) => Date | undefined;
    fieldValue: string | number;
};

type DateSection = {
    type: 'year' | 'month' | 'day';
    value: string;
    placeholder: string;
    min: number;
    max: number;
    length: number;
};

const DateInput: FC<DateInputProps> = ({
    field,
    setSomeFieldValues,
    dateToValueConverter,
    valueToDateConverter,
    fieldValue,
}) => {
    const isClient = useClientFlag();
    const containerRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLInputElement>(null);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const [focusedSection, setFocusedSection] = useState<number | null>(null);
    const [isValidDate, setIsValidDate] = useState(true);

    // Initialize sections
    const initializeSections = (dateValue?: Date): DateSection[] => {
        if (dateValue) {
            const dt = DateTime.fromJSDate(dateValue);
            return [
                { type: 'year', value: dt.year.toString(), placeholder: 'YYYY', min: 1900, max: 2100, length: 4 },
                { type: 'month', value: dt.month.toString().padStart(2, '0'), placeholder: 'MM', min: 1, max: 12, length: 2 },
                { type: 'day', value: dt.day.toString().padStart(2, '0'), placeholder: 'DD', min: 1, max: 31, length: 2 },
            ];
        }
        return [
            { type: 'year', value: '', placeholder: 'YYYY', min: 1900, max: 2100, length: 4 },
            { type: 'month', value: '', placeholder: 'MM', min: 1, max: 12, length: 2 },
            { type: 'day', value: '', placeholder: 'DD', min: 1, max: 31, length: 2 },
        ];
    };

    const [sections, setSections] = useState<DateSection[]>(() => {
        if (fieldValue !== '') {
            const dateValue = valueToDateConverter(fieldValue.toString());
            if (dateValue) {
                return initializeSections(dateValue);
            }
        }
        return initializeSections();
    });

    // Update sections when fieldValue changes
    useEffect(() => {
        if (fieldValue === '') {
            setSections(initializeSections());
            setIsValidDate(true);
        } else {
            const dateValue = valueToDateConverter(fieldValue.toString());
            if (dateValue) {
                setSections(initializeSections(dateValue));
                setIsValidDate(true);
            }
        }
    }, [fieldValue]);

    // Validate and update the date value
    const updateDateValue = useCallback((newSections: DateSection[]) => {
        const year = newSections[0].value;
        const month = newSections[1].value;
        const day = newSections[2].value;

        if (year.length === 4 && month.length === 2 && day.length === 2) {
            const dt = DateTime.fromObject({
                year: parseInt(year),
                month: parseInt(month),
                day: parseInt(day),
            });

            if (dt.isValid) {
                setSomeFieldValues([field.name, dateToValueConverter(dt.toJSDate())]);
                setIsValidDate(true);
            } else {
                setSomeFieldValues([field.name, '']);
                setIsValidDate(false);
            }
        } else if (!year && !month && !day) {
            setSomeFieldValues([field.name, '']);
            setIsValidDate(true);
        } else {
            setSomeFieldValues([field.name, '']);
            setIsValidDate(true);
        }
    }, [field.name, setSomeFieldValues, dateToValueConverter]);

    const handleSectionKeyDown = (e: React.KeyboardEvent, sectionIndex: number) => {
        const section = sections[sectionIndex];
        const key = e.key;

        // Allow tab navigation
        if (key === 'Tab') {
            return;
        }

        if (key === 'ArrowLeft') {
            e.preventDefault();
            if (sectionIndex > 0) {
                setFocusedSection(sectionIndex - 1);
            }
        } else if (key === 'ArrowRight') {
            e.preventDefault();
            if (sectionIndex < sections.length - 1) {
                setFocusedSection(sectionIndex + 1);
            }
        } else if (key === 'ArrowUp') {
            e.preventDefault();
            const currentValue = parseInt(section.value) || 0;
            if (currentValue < section.max) {
                const newValue = (currentValue + 1).toString().padStart(section.length, '0');
                const newSections = [...sections];
                newSections[sectionIndex] = { ...section, value: newValue };
                setSections(newSections);
                updateDateValue(newSections);
            }
        } else if (key === 'ArrowDown') {
            e.preventDefault();
            const currentValue = parseInt(section.value) || section.min;
            if (currentValue > section.min) {
                const newValue = (currentValue - 1).toString().padStart(section.length, '0');
                const newSections = [...sections];
                newSections[sectionIndex] = { ...section, value: newValue };
                setSections(newSections);
                updateDateValue(newSections);
            }
        } else if (key === 'Backspace') {
            e.preventDefault();
            const newSections = [...sections];
            if (section.value.length > 0) {
                // Remove last character from current section
                newSections[sectionIndex] = { ...section, value: section.value.slice(0, -1) };
                setSections(newSections);
                updateDateValue(newSections);
            } else if (sectionIndex > 0) {
                // If current section is empty, move to previous section
                setFocusedSection(sectionIndex - 1);
            }
        } else if (key === 'Delete') {
            e.preventDefault();
            const newSections = [...sections];
            newSections[sectionIndex] = { ...section, value: '' };
            setSections(newSections);
            updateDateValue(newSections);
        } else if (/^\d$/.test(key)) {
            e.preventDefault();
            const newSections = [...sections];
            let newValue = section.value + key;
            
            // Auto-advance logic
            if (newValue.length > section.length) {
                newValue = key;
            }
            
            newSections[sectionIndex] = { ...section, value: newValue };
            setSections(newSections);
            updateDateValue(newSections);

            // Auto-advance to next section when current is complete
            if (newValue.length === section.length && sectionIndex < sections.length - 1) {
                setTimeout(() => setFocusedSection(sectionIndex + 1), 0);
            }
        } else {
            // Prevent any other input (non-numeric)
            e.preventDefault();
        }
    };

    const handleSectionClick = (sectionIndex: number) => {
        setFocusedSection(sectionIndex);
    };

    // Prevent contentEditable default behavior
    const handleBeforeInput = (e: React.FormEvent) => {
        e.preventDefault();
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        // Optionally, you could parse pasted dates here
    };

    const clearDate = () => {
        setSections(initializeSections());
        setSomeFieldValues([field.name, '']);
        setIsValidDate(true);
        setFocusedSection(0);
    };

    const openPicker = () => {
        if (pickerRef.current) {
            if (typeof pickerRef.current.showPicker === 'function') {
                pickerRef.current.showPicker();
            } else {
                pickerRef.current.focus();
            }
        }
    };

    const handleDatePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value) {
            const date = new Date(value);
            setSections(initializeSections(date));
            setSomeFieldValues([field.name, dateToValueConverter(date)]);
            setIsValidDate(true);
        } else {
            clearDate();
        }
    };

    // Update focused section when it changes
    useEffect(() => {
        if (focusedSection !== null && containerRef.current) {
            const spans = containerRef.current.querySelectorAll('[role="spinbutton"]');
            const targetSpan = spans[focusedSection] as HTMLSpanElement;
            if (targetSpan) {
                targetSpan.focus();
            }
        }
    }, [focusedSection]);

    const hasValue = sections.some(s => s.value);

    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-16 my-3 text-right mr-2 text-gray-400'>
                    {field.displayName ?? field.name}
                </label>
                <div className='flex items-center border border-gray-300 rounded overflow-hidden relative my-1'>
                    <div
                        ref={containerRef}
                        role="group"
                        aria-label={field.displayName ?? field.name}
                        className="flex items-center px-3 py-1.5 bg-white cursor-text"
                        onClick={() => {
                            if (focusedSection === null) {
                                setFocusedSection(0);
                            }
                        }}
                    >
                        {sections.map((section, index) => (
                            <React.Fragment key={index}>
                                {index > 0 && <span className="mx-0.5 text-gray-400">/</span>}
                                <span
                                    role="spinbutton"
                                    tabIndex={focusedSection === index ? 0 : -1}
                                    aria-label={section.type}
                                    aria-valuemin={section.min}
                                    aria-valuemax={section.max}
                                    aria-valuenow={section.value ? parseInt(section.value) : undefined}
                                    aria-valuetext={section.value || 'Empty'}
                                    contentEditable
                                    suppressContentEditableWarning
                                    onKeyDown={(e) => handleSectionKeyDown(e, index)}
                                    onClick={() => handleSectionClick(index)}
                                    onFocus={() => setFocusedSection(index)}
                                    onBeforeInput={handleBeforeInput}
                                    onPaste={handlePaste}
                                    className={`
                                        outline-none px-0.5
                                        ${focusedSection === index ? 'bg-blue-100' : ''}
                                        ${!section.value ? 'text-gray-400' : ''}
                                        ${!isValidDate && section.value ? 'text-red-500' : ''}
                                    `}
                                    style={{ 
                                        minWidth: `${section.length}ch`,
                                        textAlign: 'center',
                                        caretColor: 'transparent'
                                    }}
                                >
                                    {section.value || section.placeholder}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>
                    <div className='flex items-center px-1'>
                        {hasValue && (
                            <button
                                type='button'
                                onClick={clearDate}
                                disabled={!isClient}
                                className='p-1 text-gray-400 hover:text-gray-600'
                                aria-label={`Clear ${field.displayName ?? field.name}`}
                            >
                                <svg className='w-4 h-4' fill='currentColor' viewBox='0 0 20 20'>
                                    <path
                                        fillRule='evenodd'
                                        d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                                        clipRule='evenodd'
                                    />
                                </svg>
                            </button>
                        )}
                        <button
                            type='button'
                            onClick={openPicker}
                            disabled={!isClient}
                            className='px-2 py-1 text-gray-400 hover:text-gray-600'
                            aria-label={`Open ${field.displayName ?? field.name} picker`}
                        >
                            <Calendar className='w-4 h-4' />
                        </button>
                    </div>
                    <input
                        ref={hiddenInputRef}
                        type="hidden"
                        id={field.name}
                        name={field.name}
                        value={sections.every(s => s.value.length === s.length) 
                            ? `${sections[0].value}-${sections[1].value}-${sections[2].value}` 
                            : ''}
                    />
                    <input
                        type='date'
                        ref={pickerRef}
                        onChange={handleDatePickerChange}
                        value={sections.every(s => s.value.length === s.length) 
                            ? `${sections[0].value}-${sections[1].value}-${sections[2].value}` 
                            : ''}
                        className='absolute opacity-0 pointer-events-none'
                        style={{
                            top: '100%',
                            left: 0,
                            width: '1px',
                            height: '1px',
                        }}
                        tabIndex={-1}
                    />
                </div>
            </div>
        </div>
    );
};

export default DateInput;