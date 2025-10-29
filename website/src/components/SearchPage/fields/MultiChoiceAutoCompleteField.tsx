import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createOptionsProviderHook, type OptionsProvider } from './AutoCompleteOptions.ts';
import { FloatingLabelContainer } from './FloatingLabelContainer.tsx';
import { getClientLogger } from '../../../clientLogger.ts';
import useClientFlag from '../../../hooks/isClient.ts';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiChevronUpDown from '~icons/mdi/chevron-up-down';
import MdiTick from '~icons/mdi/tick';

const logger = getClientLogger('MultiChoiceAutoCompleteField');

type MultiChoiceAutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    optionsProvider: OptionsProvider;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValues: (string | null)[];
    maxDisplayedOptions?: number;
};

export const MultiChoiceAutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValues,
    maxDisplayedOptions = 1000,
}: MultiChoiceAutoCompleteFieldProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const isClient = useClientFlag();

    // Maximum number of badges to show before switching to summary
    const MAX_VISIBLE_BADGES = 2;

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending: isOptionListPending, error, load } = hook();

    // Track selected values as a Set (NULL_QUERY_VALUE for nulls)
    const selectedValues = useMemo(() => new Set<string>(fieldValues.map((v) => v ?? NULL_QUERY_VALUE)), [fieldValues]);

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

    const handleChange = (value: string[] | null) => {
        if (!value || value.length === 0) {
            setSomeFieldValues([field.name, '']);
        } else {
            const convertedValues = value.map((v) => (v === NULL_QUERY_VALUE ? null : v));
            setSomeFieldValues([field.name, convertedValues]);
        }
    };

    const handleClear = () => {
        setQuery('');
        handleChange([]);
    };

    // Convert selectedValues Set to array for Combobox value
    const multiSelectValue = useMemo(() => Array.from(selectedValues), [selectedValues]);

    return (
        <div className='w-full'>
            <Combobox immediate multiple value={multiSelectValue} onChange={handleChange} disabled={!isClient}>
                <div className='relative'>
                    <FloatingLabelContainer
                        label={field.displayName ?? field.name}
                        isFocused={isFocused}
                        hasContent={selectedValues.size > 0 || query !== ''}
                        className='pr-16'
                        onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (!target.closest('button') && !target.closest('input')) {
                                inputRef.current?.focus();
                            }
                        }}
                    >
                        {selectedValues.size > 0 && (
                            <div className='flex flex-wrap gap-1 p-1 pt-3'>
                                {selectedValues.size > MAX_VISIBLE_BADGES ? (
                                    <button
                                        type='button'
                                        className='bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm hover:bg-blue-200 transition-colors cursor-pointer'
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            inputRef.current?.focus();
                                            inputRef.current?.click();
                                        }}
                                    >
                                        {selectedValues.size} selected
                                    </button>
                                ) : (
                                    Array.from(selectedValues).map((value) => {
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
                                                        const newValues = multiSelectValue.filter((v) => v !== value);
                                                        handleChange(newValues);
                                                    }}
                                                    aria-label={`Remove ${displayValue}`}
                                                    type='button'
                                                >
                                                    <MaterialSymbolsClose className='w-3 h-3' />
                                                </button>
                                            </span>
                                        );
                                    })
                                )}
                            </div>
                        )}
                        <ComboboxInput
                            ref={inputRef}
                            className={`flex-grow border-0 outline-none text-sm text-gray-900 bg-transparent appearance-none focus:ring-0 ${
                                selectedValues.size > 0 ? 'px-3 pb-1.5 pt-1' : 'px-2.5 pb-1.5 pt-3'
                            }`}
                            displayValue={() => ''}
                            onChange={(event) => setQuery(event.target.value)}
                            onFocus={() => {
                                setIsFocused(true);
                                load();
                            }}
                            onBlur={() => {
                                setIsFocused(false);
                                setQuery('');
                            }}
                            placeholder=''
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
                        <ComboboxButton className='absolute inset-y-0 right-0 flex items-center pr-2'>
                            <MdiChevronUpDown className='w-5 h-5 text-gray-400' />
                        </ComboboxButton>
                    </FloatingLabelContainer>

                    <ComboboxOptions
                        modal={false}
                        className='absolute z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm min-h-32'
                    >
                        {isOptionListPending ? (
                            <div className='px-4 py-2 text-gray-500'>Loading...</div>
                        ) : filteredOptions.length === 0 ? (
                            <div className='px-4 py-2 text-gray-500'>No options available</div>
                        ) : (
                            <>
                                <div className='flex justify-between px-4 py-2 text-xs text-gray-600 border-b border-gray-200'>
                                    <button
                                        type='button'
                                        className='hover:text-blue-600 hover:underline'
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const allValues = filteredOptions.map((opt) => opt.value);
                                            handleChange(allValues);
                                        }}
                                    >
                                        Select all
                                    </button>
                                    <button
                                        type='button'
                                        className='hover:text-blue-600 hover:underline'
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleChange([]);
                                        }}
                                    >
                                        Select none
                                    </button>
                                </div>
                                {filteredOptions.map((option) => (
                                    <ComboboxOption
                                        key={option.option}
                                        className={({ focus }) =>
                                            `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                                focus ? 'bg-blue-500 text-white' : 'text-gray-900'
                                            }`
                                        }
                                        value={option.value}
                                    >
                                        {({ focus, selected }) => {
                                            return (
                                                <>
                                                    <span
                                                        className={`inline-block ${selected ? 'font-medium' : 'font-normal'} ${
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
                                                    {selected && (
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
                                ))}
                            </>
                        )}
                    </ComboboxOptions>
                </div>
            </Combobox>
        </div>
    );
};
