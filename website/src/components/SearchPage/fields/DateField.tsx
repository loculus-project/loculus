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

// Test helper types
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

// Extracted keydown handler for testing - handles ALL keyboard input
export const handleDateKeyDown = (
    key: string,
    currentValue: string,
    selectionStart: number,
    selectionEnd: number,
    segments: DateSegment[]
): KeyDownResult => {
    const isDigit = /^\d$/.test(key);
    const isBackspace = key === 'Backspace';
    
    // Default response - no change
    const defaultResult: KeyDownResult = {
        value: currentValue,
        selectionStart,
        selectionEnd,
        preventDefault: false,
    };
    
    // Only handle digit and backspace keys
    if (!isDigit && !isBackspace) {
        return defaultResult;
    }
    
    // Parse current value into segments (preserving exact characters including placeholders)
    const parseValueIntoSegments = (value: string): string[] => {
        const segmentValues: string[] = [];
        let pos = 0;
        
        for (const segment of segments) {
            if (pos > 0) {
                pos += segment.separator.length; // Skip separator
            }
            
            let segmentValue = '';
            for (let i = 0; i < segment.length && pos < value.length; i++) {
                segmentValue += value[pos++];
            }
            segmentValues.push(segmentValue);
        }
        
        return segmentValues;
    };
    
    // Rebuild value from segments
    const buildValueFromSegments = (segmentValues: string[]): string => {
        let result = '';
        
        for (let i = 0; i < segments.length; i++) {
            if (i > 0) {
                result += segments[i].separator;
            }
            
            const segmentValue = segmentValues[i] || '';
            
            // Pad segment to correct length if needed
            let paddedSegment = segmentValue;
            if (paddedSegment.length < segments[i].length) {
                paddedSegment += segments[i].placeholder.repeat(segments[i].length - paddedSegment.length);
            }
            
            result += paddedSegment;
        }
        
        return result;
    };
    
    // Find which segment contains a position
    const findSegmentForPosition = (position: number): { segmentIndex: number; positionInSegment: number } => {
        let pos = 0;
        
        for (let i = 0; i < segments.length; i++) {
            const segmentStart = pos + (i > 0 ? segments[i].separator.length : 0);
            const segmentEnd = segmentStart + segments[i].length;
            
            if (position >= segmentStart && position <= segmentEnd) {
                return {
                    segmentIndex: i,
                    positionInSegment: position - segmentStart
                };
            }
            
            pos = segmentEnd;
        }
        
        // Default to last segment
        return { segmentIndex: segments.length - 1, positionInSegment: segments[segments.length - 1].length };
    };
    
    const segmentValues = parseValueIntoSegments(currentValue);
    
    // Handle backspace
    if (isBackspace) {
        // If at the very start, do nothing
        if (selectionStart === 0 && selectionEnd === 0) {
            return {
                ...defaultResult,
                preventDefault: true,
            };
        }
        
        // If there's a selection, we delete from the position before selection start
        const deletePos = selectionStart > 0 ? selectionStart - 1 : 0;
        const { segmentIndex, positionInSegment } = findSegmentForPosition(deletePos);
        
        // Check if we're trying to delete a separator
        if (deletePos < currentValue.length && !/[\dYMD]/.test(currentValue[deletePos])) {
            return {
                ...defaultResult,
                preventDefault: true,
            };
        }
        
        // Remove the character from the appropriate segment
        const segmentValue = segmentValues[segmentIndex];
        const digitsOnly = segmentValue.replace(/\D/g, '');
        
        if (positionInSegment < digitsOnly.length) {
            // We're deleting an actual digit
            // Keep only the digits before the deletion point
            const newDigits = digitsOnly.slice(0, positionInSegment);
            segmentValues[segmentIndex] = newDigits;
        }
        
        const newValue = buildValueFromSegments(segmentValues);
        
        // Calculate new selection
        let newSelectionStart = deletePos;
        let newSelectionEnd = deletePos;
        
        // Calculate segment boundaries
        const segmentStart = segments.slice(0, segmentIndex).reduce((sum, seg, idx) => 
            sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0) + 
            (segmentIndex > 0 ? segments[segmentIndex].separator.length : 0);
        
        // Special case: if we deleted the first digit of the first segment (year)
        if (segmentIndex === 0 && deletePos === 0) {
            // Select the entire year segment
            newSelectionStart = 0;
            newSelectionEnd = segments[0].length;
        } else if (deletePos === segmentStart + 1 && positionInSegment === 0) {
            // If we deleted the first digit of any other segment, select the whole segment
            newSelectionStart = segmentStart;
            newSelectionEnd = segmentStart + segments[segmentIndex].length;
        } else {
            // Normal case - position cursor at delete position and select to end of segment
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
    
    // Handle digit key
    if (isDigit) {
        const hasSelection = selectionStart !== selectionEnd;
        const { segmentIndex: startSegmentIndex, positionInSegment: startPosInSegment } = findSegmentForPosition(selectionStart);
        
        // If we have a selection, we need to handle it specially
        if (hasSelection) {
            const { segmentIndex: endSegmentIndex } = findSegmentForPosition(selectionEnd - 1);
            
            // Clear selected digits
            for (let i = startSegmentIndex; i <= endSegmentIndex; i++) {
                if (i === startSegmentIndex && i === endSegmentIndex) {
                    // Selection within single segment
                    const segmentValue = segmentValues[i];
                    const digitsOnly = segmentValue.replace(/\D/g, '');
                    // Keep only the digits before the selection start
                    const newDigits = digitsOnly.slice(0, startPosInSegment);
                    segmentValues[i] = newDigits;
                } else if (i === startSegmentIndex) {
                    // Start of selection
                    const segmentValue = segmentValues[i];
                    const digitsOnly = segmentValue.replace(/\D/g, '');
                    segmentValues[i] = digitsOnly.slice(0, startPosInSegment);
                } else if (i === endSegmentIndex) {
                    // End of selection
                    const segmentValue = segmentValues[i];
                    const digitsOnly = segmentValue.replace(/\D/g, '');
                    const endPosInSegment = findSegmentForPosition(selectionEnd - 1).positionInSegment + 1;
                    segmentValues[i] = digitsOnly.slice(endPosInSegment);
                } else {
                    // Middle segments - clear completely
                    segmentValues[i] = '';
                }
            }
        }
        
        // Insert the new digit
        const currentSegmentValue = segmentValues[startSegmentIndex] || '';
        const digitsOnly = currentSegmentValue.replace(/\D/g, '');
        
        // For partial selections, we want to replace the selected portion
        let newDigits;
        if (hasSelection) {
            // We already cleared the selection above, now just insert at the position
            newDigits = digitsOnly + key;
        } else {
            // No selection - insert at cursor position
            const insertPos = Math.min(startPosInSegment, digitsOnly.length);
            newDigits = digitsOnly.slice(0, insertPos) + key + digitsOnly.slice(insertPos);
        }
        
        // Don't exceed segment length
        segmentValues[startSegmentIndex] = newDigits.slice(0, segments[startSegmentIndex].length);
        
        const newValue = buildValueFromSegments(segmentValues);
        
        // Calculate new cursor position
        let newSelectionStart: number;
        let newSelectionEnd: number;
        
        const segmentStart = segments.slice(0, startSegmentIndex).reduce((sum, seg, idx) => 
            sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0) + 
            (startSegmentIndex > 0 ? segments[startSegmentIndex].separator.length : 0);
        
        // Get the updated segment value
        const updatedSegmentValue = segmentValues[startSegmentIndex];
        const segmentLength = updatedSegmentValue.length;
        
        // Check if current segment is complete (all positions filled with digits)
        const isSegmentComplete = segmentLength === segments[startSegmentIndex].length && 
            updatedSegmentValue.split('').every(char => /\d/.test(char));
        
        if (isSegmentComplete) {
            // Auto-advance to next segment
            if (startSegmentIndex < segments.length - 1) {
                const nextSegmentStart = segments.slice(0, startSegmentIndex + 1).reduce((sum, seg, idx) => 
                    sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0) + 
                    segments[startSegmentIndex + 1].separator.length;
                
                newSelectionStart = nextSegmentStart;
                newSelectionEnd = nextSegmentStart + segments[startSegmentIndex + 1].length;
            } else {
                // Last segment - position at end
                const totalLength = segments.reduce((sum, seg, idx) => 
                    sum + seg.length + (idx > 0 ? seg.separator.length : 0), 0);
                newSelectionStart = totalLength;
                newSelectionEnd = totalLength;
            }
        } else {
            // Position cursor after the inserted digit and select rest of segment
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
    
    // Define date segments configuration
    const segments = [
        { length: 4, placeholder: 'Y', separator: '' },  // Year
        { length: 2, placeholder: 'M', separator: '-' }, // Month
        { length: 2, placeholder: 'D', separator: '-' }, // Day
    ];
    
    const mask = segments
        .map((seg, i) => (i > 0 ? seg.separator : '') + seg.placeholder.repeat(seg.length))
        .join('');
    
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLInputElement>(null);
    
    // Initialize local state based on field value
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

    // Only reset input value if fieldValue is explicitly cleared from outside
    useEffect(() => {
        if (fieldValue === '' && inputValue !== mask) {
            // Field was cleared externally
            setInputValue(mask);
            setIsValidDate(true);
        }
    }, [fieldValue, mask]);

    const handleFocus = () => {
        // Set selection based on current value
        if (inputRef.current) {
            const digits = inputValue.replace(/\D/g, '').length;
            if (digits === 0) {
                inputRef.current.setSelectionRange(0, 4);
            } else {
                // Find the appropriate position
                let segmentStart = 0;
                let digitsSoFar = 0;
                
                for (let i = 0; i < segments.length; i++) {
                    const segment = segments[i];
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
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
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
        const result = handleDateKeyDown(
            e.key,
            inputValue,
            el.selectionStart ?? 0,
            el.selectionEnd ?? 0,
            segments
        );

        if (result.preventDefault) {
            e.preventDefault();
            setInputValue(result.value);
            
            // Check if we have a complete valid date or if the field was cleared
            const digits = result.value.replace(/\D/g, '');
            if (digits.length === 8) { // YYYYMMDD
                const year = digits.slice(0, 4);
                const month = digits.slice(4, 6);
                const day = digits.slice(6, 8);
                const iso = `${year}-${month}-${day}`;
                const dt = DateTime.fromISO(iso);
                if (dt.isValid) {
                    setSomeFieldValues([field.name, dateToValueConverter(dt.toJSDate())]);
                    setIsValidDate(true);
                } else {
                    // Invalid date with 8 digits
                    setIsValidDate(false);
                }
            } else if (digits.length === 0 && result.value === mask) {
                // User has cleared the date back to all placeholders
                setSomeFieldValues([field.name, '']);
                setIsValidDate(true);
            } else {
                // For incomplete dates (1-7 digits), consider them valid (in progress)
                setIsValidDate(true);
            }
            
            // Apply the selection after React updates
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.setSelectionRange(result.selectionStart, result.selectionEnd);
                }
            }, 0);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Prevent any changes that weren't handled by keydown
        e.preventDefault();
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
                        onClick={handleClick}
                        disabled={!isClient}
                        className={`input input-sm w-32 ${!isValidDate ? 'input-error' : ''}`}
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
                    <input 
                        type='date' 
                        ref={pickerRef} 
                        onChange={handleDateChange} 
                        className='absolute opacity-0 pointer-events-none'
                        style={{ 
                            top: '100%', 
                            left: 0,
                            width: '1px',
                            height: '1px'
                        }}
                        tabIndex={-1}
                    />
                </div>
            </div>
        </div>
    );
};
