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

    const handleChange = (value: string | number | null) => {
        if (!multiSelect) {
            // Single-select mode - just set the value
            setSomeFieldValues([field.name, value ?? NULL_QUERY_VALUE]);
            return;
        }

        // Multi-select mode
        if (!value && value !== null) return;

        const newValues = new Set<string>(selectedValues);

        // Convert null to NULL_QUERY_VALUE for consistent handling
        const valueToToggle = value === null ? NULL_QUERY_VALUE : value.toString();

        if (newValues.has(valueToToggle)) {
            // If already selected, remove it
            newValues.delete(valueToToggle);
        } else {
            // Otherwise add it
            newValues.add(valueToToggle);
        }

        if (newValues.size === 0) {
            // If all values were removed, just clear the field
            setSomeFieldValues([field.name, '']);
        } else {
            // Otherwise set the field to the array of values
            setSomeFieldValues([field.name, Array.from(newValues) as any]);
        }

        setQuery(''); // Clear input field after selection
    };

    const handleClear = () => {
        setQuery('');
        // Clear the field value, works for both single and multi-select
        setSomeFieldValues([field.name, '']);
    };

    // Display selected values for multi-select
    const displaySelectedValues = () => {
        if (!multiSelect || selectedValues.size === 0) return null;

        return (
            <div className='flex flex-wrap gap-1 mt-1 mb-1'>
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
                                    handleChange(value === NULL_QUERY_VALUE ? null : value);
                                }}
                                aria-label={`Remove ${displayValue}`}
                            >
                                <MaterialSymbolsClose className='w-3 h-3' />
                            </button>
                        </span>
                    );
                })}
            </div>
        );
    };

    return (
        <DisabledUntilHydrated>
            <div className='w-full'>
                <Combobox immediate value={multiSelect ? null : fieldValue} onChange={handleChange}>
                    <div className='relative'>
                        <ComboboxInput
                            displayValue={
                                multiSelect
                                    ? () => ''
                                    : (value: string | number | null) => (value === null ? '(blank)' : String(value))
                            }
                            onChange={(event) => setQuery(event.target.value)}
                            onFocus={load}
                            placeholder={
                                multiSelect && selectedValues.size > 0 ? '' : (field.displayName ?? field.name)
                            }
                            as={CustomInput}
                        />
                        {((fieldValue !== '' && fieldValue !== undefined) ||
                            (multiSelect && selectedValues.size > 0) ||
                            query !== '') && (
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
                {displaySelectedValues()}
            </div>
        </DisabledUntilHydrated>
    );
};
