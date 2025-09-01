import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { type InputHTMLAttributes, useEffect, useMemo, useState, useRef, forwardRef } from 'react';

import { createOptionsProviderHook, type OptionsProvider } from './AutoCompleteOptions.ts';
import { TextField } from './TextField.tsx';
import { getClientLogger } from '../../../clientLogger.ts';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import DisabledUntilHydrated from '../../DisabledUntilHydrated';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiTick from '~icons/mdi/tick';
import MdiChevronUpDown from '~icons/mdi/chevron-up-down';

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

type AutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    optionsProvider: OptionsProvider;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue?: string | number | null;
    fieldValues?: string[];
    maxDisplayedOptions?: number;
    multiSelect?: boolean;
};

export const AutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValue,
    fieldValues = [],
    maxDisplayedOptions = 1000,
    multiSelect = false,
}: AutoCompleteFieldProps) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isLoading: isOptionListLoading, error, load } = hook();

    // For multi-select mode, track selected values as a Set
    const selectedValues = useMemo(() => {
        if (multiSelect) {
            return new Set<string>(fieldValues);
        } else {
            // Handle null values properly for single select
            if (fieldValue === null) {
                return new Set<string>([NULL_QUERY_VALUE]);
            }
            return fieldValue !== undefined && fieldValue !== ''
                ? new Set<string>([fieldValue.toString()])
                : new Set<string>();
        }
    }, [multiSelect, fieldValue, fieldValues]);

    useEffect(() => {
        if (error) {
            void logger.error(`Error while loading autocomplete options: ${error.message} - ${error.stack}`);
        }
    }, [error]);

    const filteredOptions = useMemo(() => {
        const allMatchedOptions =
            query === ''
                ? options
                : options.filter((option) => option.option.toLowerCase().includes(query.toLowerCase()));
        return allMatchedOptions.slice(0, maxDisplayedOptions);
    }, [options, query, maxDisplayedOptions]);

    const handleChange = (value: any) => {
        if (!multiSelect) {
            // Single-select mode - just set the value
            setSomeFieldValues([field.name, value ?? NULL_QUERY_VALUE]);
            return;
        }

        // Multi-select mode - value is an array when multiple=true
        if (Array.isArray(value)) {
            if (value.length === 0) {
                setSomeFieldValues([field.name, '']);
            } else {
                // Convert any null values to NULL_QUERY_VALUE
                const processedValues = value.map((v) => (v === null ? NULL_QUERY_VALUE : v.toString()));
                setSomeFieldValues([field.name, processedValues as any]);
            }
        }
    };

    const handleClear = () => {
        setQuery('');
        if (multiSelect) {
            // For multi-select, pass an empty array to handleChange
            handleChange([]);
        } else {
            // For single-select, clear normally
            setSomeFieldValues([field.name, '']);
        }
    };

    // Convert selectedValues Set to array for multi-select Combobox value
    const multiSelectValue = useMemo(() => {
        if (!multiSelect) return undefined;
        return Array.from(selectedValues).map((v) => (v === NULL_QUERY_VALUE ? null : v));
    }, [multiSelect, selectedValues]);

    return (
        <DisabledUntilHydrated>
            <div className='w-full'>
                <Combobox
                    immediate
                    multiple={multiSelect}
                    value={multiSelect ? multiSelectValue : fieldValue}
                    onChange={handleChange}
                >
                    <div className='relative'>
                        {multiSelect ? (
                            // Multi-select mode with badges inside the field
                            <div
                                className='relative flex flex-wrap items-center border border-gray-300 rounded-md pr-16 cursor-text hover:border-gray-400 transition-colors'
                                onClick={(e) => {
                                    // Focus the input when clicking anywhere in the field
                                    // unless clicking on a button or the input itself
                                    const target = e.target as HTMLElement;
                                    if (!target.closest('button') && !target.closest('input')) {
                                        inputRef.current?.focus();
                                    }
                                }}
                            >
                                {selectedValues.size > 0 && (
                                    <div className='flex flex-wrap gap-1 p-1'>
                                        {Array.from(selectedValues).map((value) => {
                                            const displayValue = value === NULL_QUERY_VALUE ? '(blank)' : value;
                                            return (
                                                <span
                                                    key={value}
                                                    className='bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs flex items-center'
                                                >
                                                    {displayValue}
                                                    <button
                                                        className='ml-1 text-blue-500 hover:text-blue-700'
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            // Remove this value from the array
                                                            const newValues =
                                                                multiSelectValue?.filter((v) => {
                                                                    const compareValue =
                                                                        v === null ? NULL_QUERY_VALUE : v;
                                                                    return compareValue !== value;
                                                                }) || [];
                                                            handleChange(newValues);
                                                        }}
                                                        aria-label={`Remove ${displayValue}`}
                                                        type='button'
                                                    >
                                                        <MaterialSymbolsClose className='w-3 h-3' />
                                                    </button>
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                                <ComboboxInput
                                    ref={inputRef}
                                    className={`flex-grow border-0 outline-none px-3 ${
                                        selectedValues.size > 0 ? 'p-1' : 'py-2.5'
                                    }`}
                                    displayValue={() => ''}
                                    onChange={(event) => setQuery(event.target.value)}
                                    onFocus={load}
                                    placeholder={selectedValues.size > 0 ? '' : (field.displayName ?? field.name)}
                                    aria-label={field.displayName ?? field.name}
                                />
                                {(selectedValues.size > 0 || query !== '') && (
                                    <button
                                        className='absolute inset-y-0 right-8 flex items-center pr-2'
                                        onClick={handleClear}
                                        aria-label={`Clear ${field.displayName ?? field.name}`}
                                        type='button'
                                    >
                                        <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                                    </button>
                                )}
                                <ComboboxButton
                                    className='absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none'
                                    ref={buttonRef}
                                >
                                    <MdiChevronUpDown className='w-5 h-5 text-gray-400' />
                                </ComboboxButton>
                            </div>
                        ) : (
                            // Single-select mode (original layout)
                            <>
                                <ComboboxInput
                                    displayValue={(value: string | number | null) =>
                                        value === null ? '(blank)' : String(value)
                                    }
                                    onChange={(event) => setQuery(event.target.value)}
                                    onFocus={load}
                                    placeholder={field.displayName ?? field.name}
                                    as={CustomInput}
                                />
                                {((fieldValue !== '' && fieldValue !== undefined) || query !== '') && (
                                    <button
                                        className='absolute inset-y-0 right-8 flex items-center pr-2 h-5 top-4 bg-white rounded-sm'
                                        onClick={handleClear}
                                        aria-label={`Clear ${field.displayName ?? field.name}`}
                                    >
                                        <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                                    </button>
                                )}
                                <ComboboxButton
                                    className='absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none'
                                    ref={buttonRef}
                                >
                                    <MdiChevronUpDown className='w-5 h-5 text-gray-400' />
                                </ComboboxButton>
                            </>
                        )}

                        <ComboboxOptions
                            modal={false}
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
                                        value={option.value}
                                    >
                                        {({ focus }) => {
                                            const isSelected = selectedValues.has(
                                                option.value?.toString() ?? NULL_QUERY_VALUE,
                                            );
                                            return (
                                                <>
                                                    <span
                                                        className={`inline-block ${isSelected ? 'font-medium' : 'font-normal'} ${
                                                            option.option === '(blank)' ? 'italic' : ''
                                                        }`}
                                                    >
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
                                                            <MdiTick className='w-5 h-5' />
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
            </div>
        </DisabledUntilHydrated>
    );
};
