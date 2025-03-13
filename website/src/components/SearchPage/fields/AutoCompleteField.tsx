import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { type InputHTMLAttributes, useEffect, useMemo, useState, useRef, forwardRef } from 'react';

import { TextField } from './TextField.tsx';
import { getClientLogger } from '../../../clientLogger.ts';
import useClientFlag from '../../../hooks/isClient.ts';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';

export type Option = {
    option: string;
    count: number | undefined;
};

type AutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    fieldValue?: string | number | null;
    fieldValues?: string[];
    lapisSearchParameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451) use a proper type
    multiSelect?: boolean;
};

const CustomInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>((props, ref) => (
    <TextField
        ref={ref}
        fieldValue={props.value}
        onChange={props.onChange}
        onFocus={props.onFocus}
        disabled={props.disabled}
        autoComplete='off'
        placeholder={props.placeholder ?? ''}
        label={props.placeholder ?? ''}
    />
));

const logger = getClientLogger('AutoCompleteField');

export const AutoCompleteField = ({
    field,
    setSomeFieldValues,
    lapisUrl,
    fieldValue,
    fieldValues = [],
    lapisSearchParameters,
    multiSelect = false,
}: AutoCompleteFieldProps) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const isClient = useClientFlag();
    const [query, setQuery] = useState('');
    const {
        data,
        isLoading: isOptionListLoading,
        error,
        mutate,
    } = lapisClientHooks(lapisUrl).zodiosHooks.useAggregated({}, {});

    // For multi-select mode, we need to track selected values as an array
    const selectedValues = useMemo(() => {
        if (multiSelect) {
            return new Set(fieldValues);
        } else {
            return fieldValue ? new Set([fieldValue.toString()]) : new Set();
        }
    }, [multiSelect, fieldValue, fieldValues]);

    useEffect(() => {
        if (error) {
            void logger.error(`Error while loading autocomplete options: ${error.message} - ${error.stack}`);
        }
    }, [error]);

    const handleOpen = () => {
        const otherFields = { ...lapisSearchParameters };
        delete otherFields[field.name];

        Object.keys(otherFields).forEach((key) => {
            if (otherFields[key] === '') {
                delete otherFields[key];
            }
        });

        mutate({ fields: [field.name], ...otherFields });
    };

    const options: Option[] = useMemo(() => {
        const options: Option[] = (data?.data ?? [])
            .filter(
                (it) =>
                    typeof it[field.name] === 'string' ||
                    typeof it[field.name] === 'boolean' ||
                    typeof it[field.name] === 'number',
            )
            .map((it) => ({ option: it[field.name]!.toString(), count: it.count }));

        return options.sort((a, b) => (a.option.toLowerCase() < b.option.toLowerCase() ? -1 : 1));
    }, [data, field.name]);

    const filteredOptions = useMemo(
        () =>
            query === ''
                ? options
                : options.filter((option) => option.option.toLowerCase().includes(query.toLowerCase())),
        [options, query],
    );

    const handleChange = (value: string | null) => {
        if (!multiSelect) {
            // Single-select mode - just set the value
            setSomeFieldValues([field.name, value ?? '']);
            return;
        }

        // Multi-select mode
        if (!value) return;

        const newValues = new Set(selectedValues);
        
        if (newValues.has(value)) {
            // If already selected, remove it
            newValues.delete(value);
        } else {
            // Otherwise add it
            newValues.add(value);
        }

        if (newValues.size === 0) {
            // If all values were removed, just clear the field
            setSomeFieldValues([field.name, '']);
        } else {
            // Otherwise set the field to the array of values
            setSomeFieldValues([field.name, [...newValues]]);
        }
        
        setQuery(''); // Clear input field after selection
    };

    // Display selected values for multi-select
    const displaySelectedValues = () => {
        if (!multiSelect || selectedValues.size === 0) return null;
        
        return (
            <div className="flex flex-wrap gap-1 mt-1 mb-1">
                {[...selectedValues].map(value => (
                    <span key={value} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs flex items-center">
                        {value}
                        <button 
                            className="ml-1 text-blue-500 hover:text-blue-700"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleChange(value);
                            }}
                            aria-label={`Remove ${value}`}
                        >
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </span>
                ))}
            </div>
        );
    };

    const handleClear = () => {
        setQuery('');
        // Clear the field value, works for both single and multi-select
        setSomeFieldValues([field.name, '']);
    };

    return (
        <div className="w-full">
            <Combobox
                immediate
                value={multiSelect ? null : fieldValue}
                onChange={handleChange}
                disabled={!isClient}
            >
                <div className='relative'>
                    <ComboboxInput
                        displayValue={multiSelect ? () => '' : (value: string) => value}
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={handleOpen}
                        placeholder={multiSelect && selectedValues.size > 0 ? '' : field.label}
                        as={CustomInput}
                        disabled={!isClient}
                    />
                    {((fieldValue !== '' && fieldValue !== undefined && fieldValue !== null) || 
                      (multiSelect && selectedValues.size > 0) || 
                      query !== '') && (
                        <button
                            className='absolute inset-y-0 right-8 flex items-center pr-2 h-5 top-4 bg-white rounded-sm'
                            onClick={handleClear}
                            aria-label='Clear'
                        >
                            <svg className='w-5 h-5 text-gray-400' fill='currentColor' viewBox='0 0 20 20'>
                                <path
                                    fillRule='evenodd'
                                    d='M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z'
                                    clipRule='evenodd'
                                />
                            </svg>
                        </button>
                    )}
                    <ComboboxButton
                        className='absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none'
                        ref={buttonRef}
                    >
                        <svg className='w-5 h-5 text-gray-400' fill='currentColor' viewBox='0 0 20 20'>
                            <path d='M7 7l3-3 3 3m0 6l-3 3-3-3' />
                        </svg>
                    </ComboboxButton>

                    <ComboboxOptions
                        className='absolute z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm
              min-h-32
              '
                    >
                        {isOptionListLoading ? (
                            <div className='px-4 py-2 text-gray-500'>Loading...</div>
                        ) : filteredOptions.length === 0 ? (
                            <div className='px-4 py-2 text-gray-500'>No options available</div>
                        ) : (
                            filteredOptions.map((option) => (
                                <ComboboxOption
                                    key={option.option}
                                    className={({ focus }) =>
                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                            focus ? 'bg-blue-500 text-white' : 'text-gray-900'
                                        }`
                                    }
                                    value={option.option}
                                >
                                    {({ focus }) => {
                                        const isSelected = selectedValues.has(option.option);
                                        return (
                                            <>
                                                <span className={`inline-block ${isSelected ? 'font-medium' : 'font-normal'}`}>
                                                    {option.option}
                                                </span>
                                                {option.count !== undefined && (
                                                    <span className='inline-block ml-1'>
                                                        ({formatNumberWithDefaultLocale(option.count)})
                                                    </span>
                                                )}
                                                {isSelected && (
                                                    <span
                                                        className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                                            focus ? 'text-white' : 'text-blue-500'
                                                        }`}
                                                    >
                                                        <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
                                                            <path
                                                                fillRule='evenodd'
                                                                d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                                                                clipRule='evenodd'
                                                            />
                                                        </svg>
                                                    </span>
                                                )}
                                            </>
                                        );
                                    }}
                                </ComboboxOption>
                            ))
                        )}
                    </ComboboxOptions>
                </div>
            </Combobox>
            {displaySelectedValues()}
        </div>
    );
};
