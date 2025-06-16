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

export type DateSegment = {
    length: number;
    placeholder: string;
    separator: string;
};

export type KeyDownResult = {
    value: string;
    selectionStart: number;
    selectionEnd: number;
    preventDefault: boolean;
};

export const handleDateKeyDown = (
    key: string,
    currentValue: string,
    selectionStart: number,
    selectionEnd: number,
    segments: DateSegment[],
): KeyDownResult => {
    const isDigit = /^\d$/.test(key);
    const isBackspace = key === 'Backspace';

    const defaultResult: KeyDownResult = {
        value: currentValue,
        selectionStart,
        selectionEnd,
        preventDefault: false,
    };

    if (!isDigit && !isBackspace) {
        return defaultResult;
    }

    const parseValueIntoSegments = (value: string): string[] => {
        const segmentValues: string[] = [];
        let pos = 0;

        for (const segment of segments) {
            if (pos > 0) {
                pos += segment.separator.length;
            }

            let segmentValue = '';
            for (let i = 0; i < segment.length && pos < value.length; i++) {
                segmentValue += value[pos++];
            }
            segmentValues.push(segmentValue);
        }

        return segmentValues;
    };

    const buildValueFromSegments = (segmentValues: string[]): string => {
        let result = '';

        for (let i = 0; i < segments.length; i++) {
            if (i > 0) {
                result += segments[i].separator;
            }

            const segmentValue = segmentValues[i] || '';

            let paddedSegment = segmentValue;
            if (paddedSegment.length < segments[i].length) {
                paddedSegment += segments[i].placeholder.repeat(segments[i].length - paddedSegment.length);
            }

            result += paddedSegment;
        }

        return result;
    };

    const findSegmentForPosition = (position: number): { segmentIndex: number; positionInSegment: number } => {
        let pos = 0;

        for (let i = 0; i < segments.length; i++) {
            const segmentStart = pos + (i > 0 ? segments[i].separator.length : 0);
            const segmentEnd = segmentStart + segments[i].length;

            if (position >= segmentStart && position <= segmentEnd) {
                return {
                    segmentIndex: i,
                    positionInSegment: position - segmentStart,
                };
            }

            pos = segmentEnd;
        }

        return { segmentIndex: segments.length - 1, positionInSegment: segments[segments.length - 1].length };
    };

    const segmentValues = parseValueIntoSegments(currentValue);

    if (isBackspace) {
        if (selectionStart === 0 && selectionEnd === 0) {
            return {
                ...defaultResult,
                preventDefault: true,
            };
        }

        const hasSelection = selectionStart !== selectionEnd;

        if (hasSelection) {
            const { segmentIndex: startSegmentIndex } = findSegmentForPosition(selectionStart);
            const { segmentIndex: endSegmentIndex } = findSegmentForPosition(selectionEnd - 1);

            let segmentBoundaryStart = 0;
            for (let i = 0; i < startSegmentIndex; i++) {
                segmentBoundaryStart += segments[i].length + (i > 0 ? segments[i].separator.length : 0);
            }
            if (startSegmentIndex > 0) {
                segmentBoundaryStart += segments[startSegmentIndex].separator.length;
            }
            const segmentBoundaryEnd = segmentBoundaryStart + segments[startSegmentIndex].length;

            if (
                startSegmentIndex === endSegmentIndex &&
                selectionStart === segmentBoundaryStart &&
                selectionEnd === segmentBoundaryEnd
            ) {
                segmentValues[startSegmentIndex] = '';
                const newValue = buildValueFromSegments(segmentValues);

                return {
                    value: newValue,
                    selectionStart: segmentBoundaryStart,
                    selectionEnd: segmentBoundaryEnd,
                    preventDefault: true,
                };
            }
        }

        const deletePos = selectionStart > 0 ? selectionStart - 1 : 0;
        const { segmentIndex, positionInSegment } = findSegmentForPosition(deletePos);

        if (deletePos < currentValue.length && !/[\dYMD]/.test(currentValue[deletePos])) {
            return {
                ...defaultResult,
                preventDefault: true,
            };
        }

        const segmentValue = segmentValues[segmentIndex];
        const digitsOnly = segmentValue.replace(/\D/g, '');

        if (positionInSegment < digitsOnly.length) {
            const newDigits = digitsOnly.slice(0, positionInSegment);
            segmentValues[segmentIndex] = newDigits;
        }

        const newValue = buildValueFromSegments(segmentValues);

        let newSelectionStart = deletePos;
        let newSelectionEnd = deletePos;

        const segmentStart =
            segments
                .slice(0, segmentIndex)
                .reduce((sum, seg, idx) => sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0) +
            (segmentIndex > 0 ? segments[segmentIndex].separator.length : 0);

        if (segmentIndex === 0 && deletePos === 0) {
            newSelectionStart = 0;
            newSelectionEnd = segments[0].length;
        } else if (deletePos === segmentStart + 1 && positionInSegment === 0) {
            newSelectionStart = segmentStart;
            newSelectionEnd = segmentStart + segments[segmentIndex].length;
        } else {
            newSelectionStart = deletePos;
            newSelectionEnd = segmentStart + segments[segmentIndex].length;
        }

        return {
            value: newValue,
            selectionStart: newSelectionStart,
            selectionEnd: newSelectionEnd,
            preventDefault: true,
        };
    }

    if (isDigit) {
        const hasSelection = selectionStart !== selectionEnd;
        const { segmentIndex: startSegmentIndex, positionInSegment: startPosInSegment } =
            findSegmentForPosition(selectionStart);

        if (hasSelection) {
            const { segmentIndex: endSegmentIndex } = findSegmentForPosition(selectionEnd - 1);

            for (let i = startSegmentIndex; i <= endSegmentIndex; i++) {
                if (i === startSegmentIndex && i === endSegmentIndex) {
                    const segmentValue = segmentValues[i];
                    const digitsOnly = segmentValue.replace(/\D/g, '');
                    const newDigits = digitsOnly.slice(0, startPosInSegment);
                    segmentValues[i] = newDigits;
                } else if (i === startSegmentIndex) {
                    const segmentValue = segmentValues[i];
                    const digitsOnly = segmentValue.replace(/\D/g, '');
                    segmentValues[i] = digitsOnly.slice(0, startPosInSegment);
                } else if (i === endSegmentIndex) {
                    const segmentValue = segmentValues[i];
                    const digitsOnly = segmentValue.replace(/\D/g, '');
                    const endPosInSegment = findSegmentForPosition(selectionEnd - 1).positionInSegment + 1;
                    segmentValues[i] = digitsOnly.slice(endPosInSegment);
                } else {
                    segmentValues[i] = '';
                }
            }
        }

        const currentSegmentValue = segmentValues[startSegmentIndex] || '';
        const digitsOnly = currentSegmentValue.replace(/\D/g, '');

        let newDigits;
        if (hasSelection) {
            newDigits = digitsOnly + key;
        } else {
            const insertPos = Math.min(startPosInSegment, digitsOnly.length);
            newDigits = digitsOnly.slice(0, insertPos) + key + digitsOnly.slice(insertPos);
        }

        segmentValues[startSegmentIndex] = newDigits.slice(0, segments[startSegmentIndex].length);

        const newValue = buildValueFromSegments(segmentValues);

        let newSelectionStart: number;
        let newSelectionEnd: number;

        const segmentStart =
            segments
                .slice(0, startSegmentIndex)
                .reduce((sum, seg, idx) => sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0) +
            (startSegmentIndex > 0 ? segments[startSegmentIndex].separator.length : 0);

        const updatedSegmentValue = segmentValues[startSegmentIndex];
        const segmentLength = updatedSegmentValue.length;

        const isSegmentComplete =
            segmentLength === segments[startSegmentIndex].length &&
            updatedSegmentValue.split('').every((char) => /\d/.test(char));

        if (isSegmentComplete) {
            if (startSegmentIndex < segments.length - 1) {
                const nextSegmentStart =
                    segments
                        .slice(0, startSegmentIndex + 1)
                        .reduce((sum, seg, idx) => sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0) +
                    segments[startSegmentIndex + 1].separator.length;

                newSelectionStart = nextSegmentStart;
                newSelectionEnd = nextSegmentStart + segments[startSegmentIndex + 1].length;
            } else {
                const totalLength = segments.reduce(
                    (sum, seg, idx) => sum + seg.length + (idx > 0 ? seg.separator.length : 0),
                    0,
                );
                newSelectionStart = totalLength;
                newSelectionEnd = totalLength;
            }
        } else {
            newSelectionStart = segmentStart + segmentLength;
            newSelectionEnd = segmentStart + segments[startSegmentIndex].length;
        }

        return {
            value: newValue,
            selectionStart: newSelectionStart,
            selectionEnd: newSelectionEnd,
            preventDefault: true,
        };
    }

    return defaultResult;
};

const CustomizedDateInput: FC<CustomizedDatePickerProps> = ({
    field,
    setSomeFieldValues,
    dateToValueConverter,
    valueToDateConverter,
    fieldValue,
}) => {
    const isClient = useClientFlag();

    const segments = [
        { length: 4, placeholder: 'Y', separator: '' },
        { length: 2, placeholder: 'M', separator: '-' },
        { length: 2, placeholder: 'D', separator: '-' },
    ];

    const mask = segments.map((seg, i) => (i > 0 ? seg.separator : '') + seg.placeholder.repeat(seg.length)).join('');

    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLInputElement>(null);

    const initialValue = (() => {
        if (fieldValue !== '') {
            const dateValue = valueToDateConverter(fieldValue.toString());
            if (dateValue) {
                return DateTime.fromJSDate(dateValue).toISODate() ?? mask;
            }
        }
        return mask;
    })();

    const [inputValue, setInputValue] = useState(initialValue);
    const [isValidDate, setIsValidDate] = useState(true);

    const isUserEditingRef = useRef(false);

    useEffect(() => {
        if (isUserEditingRef.current) {
            return;
        }

        if (fieldValue === '') {
            if (inputValue !== mask) {
                setInputValue(mask);
                setIsValidDate(true);
            }
        } else {
            const dateValue = valueToDateConverter(fieldValue.toString());
            if (dateValue) {
                const newValue = DateTime.fromJSDate(dateValue).toISODate();
                if (newValue && newValue !== inputValue) {
                    setInputValue(newValue);
                    setIsValidDate(true);
                }
            }
        }
    }, [fieldValue]);

    const handleFocus = () => {
        isUserEditingRef.current = true;
        if (inputRef.current) {
            const digits = inputValue.replace(/\D/g, '').length;
            if (digits === 0) {
                inputRef.current.setSelectionRange(0, 4);
            } else {
                let segmentStart = 0;
                let digitsSoFar = 0;

                for (const segment of segments) {
                    if (digits <= digitsSoFar + segment.length) {
                        const pos = segmentStart + segment.separator.length + (digits - digitsSoFar);
                        const endPos = segmentStart + segment.separator.length + segment.length;
                        inputRef.current.setSelectionRange(pos, endPos);
                        break;
                    }
                    digitsSoFar += segment.length;
                    segmentStart += segment.separator.length + segment.length;
                }
            }
        }
    };

    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
        const el = e.currentTarget;
        const clickPosition = el.selectionStart ?? 0;

        let position = 0;
        for (const segment of segments) {
            const segmentStart = position + segment.separator.length;
            const segmentEnd = segmentStart + segment.length;

            if (clickPosition >= position && clickPosition < segmentEnd) {
                el.setSelectionRange(segmentStart, segmentEnd);
                return;
            }

            position = segmentEnd;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const el = e.currentTarget;
        const result = handleDateKeyDown(e.key, inputValue, el.selectionStart ?? 0, el.selectionEnd ?? 0, segments);

        if (result.preventDefault) {
            e.preventDefault();
            setInputValue(result.value);

            const digits = result.value.replace(/\D/g, '');
            if (digits.length === 8) {
                const year = digits.slice(0, 4);
                const month = digits.slice(4, 6);
                const day = digits.slice(6, 8);
                const iso = `${year}-${month}-${day}`;
                const dt = DateTime.fromISO(iso);
                if (dt.isValid) {
                    setSomeFieldValues([field.name, dateToValueConverter(dt.toJSDate())]);
                    setIsValidDate(true);
                } else {
                    setIsValidDate(false);
                }
            } else if (digits.length === 0 && result.value === mask) {
                setSomeFieldValues([field.name, '']);
                setIsValidDate(true);
            } else {
                setIsValidDate(true);
            }

            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
                }
            }, 0);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.value === '') {
            isUserEditingRef.current = true;
            setInputValue(mask);
            setSomeFieldValues([field.name, '']);
            setIsValidDate(true);

            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.setSelectionRange(0, 4);
                }
            }, 0);

            void Promise.resolve().then(() => {
                isUserEditingRef.current = false;
            });
        } else {
            e.preventDefault();
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
            setIsValidDate(true);
        } else {
            setInputValue(mask);
            setSomeFieldValues([field.name, '']);
            setIsValidDate(true);
        }
    };

    return (
        <div>
            <div className='flex justify-between items-center'>
                <label htmlFor={field.name} className='block text-sm w-16 my-3 text-right mr-2 text-gray-400'>
                    {field.displayName ?? field.name}
                </label>
                <div className='flex items-center relative'>
                    <input
                        ref={inputRef}
                        type='text'
                        id={field.name}
                        name={field.name}
                        value={inputValue}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onFocus={handleFocus}
                        onBlur={() => {
                            isUserEditingRef.current = false;
                        }}
                        onClick={handleClick}
                        disabled={!isClient}
                        className={`input input-sm w-32 ${!isValidDate ? 'input-error' : ''}`}
                    />
                    {inputValue !== mask && (
                        <button
                            type='button'
                            onClick={() => {
                                setInputValue(mask);
                                setSomeFieldValues([field.name, '']);
                                setIsValidDate(true);
                                setTimeout(() => {
                                    if (inputRef.current) {
                                        inputRef.current.setSelectionRange(0, 4);
                                    }
                                }, 0);
                            }}
                            disabled={!isClient}
                            className='absolute right-8 top-1/2 -translate-y-1/2 p-1'
                            aria-label={`Clear ${field.displayName ?? field.name}`}
                        >
                            <svg className='w-4 h-4 mr-2 text-gray-400' fill='currentColor' viewBox='0 0 20 20'>
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
                        className='ml-2 border rounded px-2'
                        aria-label={`Open ${field.displayName ?? field.name} picker`}
                    >
                        📅
                    </button>
                    <input
                        type='date'
                        ref={pickerRef}
                        onChange={handleDateChange}
                        value={(() => {
                            const digits = inputValue.replace(/\D/g, '');
                            if (digits.length === 8) {
                                const year = digits.slice(0, 4);
                                const month = digits.slice(4, 6);
                                const day = digits.slice(6, 8);
                                const iso = `${year}-${month}-${day}`;
                                const dt = DateTime.fromISO(iso);
                                if (dt.isValid) {
                                    return iso;
                                }
                            }
                            return '';
                        })()}
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
