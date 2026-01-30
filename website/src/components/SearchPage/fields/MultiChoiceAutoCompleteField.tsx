import { useMemo, useRef, useState } from 'react';

import { AutoCompleteDropdown, useAutoCompleteOptions } from './AutoCompleteCommon.tsx';
import type { OptionsProvider } from './AutoCompleteOptions.ts';
import { FloatingLabelContainer } from './FloatingLabelContainer.tsx';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import { Button } from '../../common/Button';
import { Combobox, ComboboxButton, ComboboxInput } from '../../common/headlessui/Combobox';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiChevronUpDown from '~icons/mdi/chevron-up-down';

// Maximum number of badges to show before switching to summary
const MAX_VISIBLE_BADGES = 2;

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

    const { filteredOptions, isPending, load } = useAutoCompleteOptions(optionsProvider, query, maxDisplayedOptions);

    // Track selected values as a Set (NULL_QUERY_VALUE for nulls)
    const selectedValues = useMemo(() => new Set<string>(fieldValues.map((v) => v ?? NULL_QUERY_VALUE)), [fieldValues]);

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

    const headerContent = (
        <div className='flex justify-between px-4 py-2 text-xs text-gray-600 border-b border-gray-200'>
            <Button
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
            </Button>
            <Button
                type='button'
                className='hover:text-blue-600 hover:underline'
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleChange([]);
                }}
            >
                Select none
            </Button>
        </div>
    );

    return (
        <div className='w-full'>
            <Combobox immediate multiple value={multiSelectValue} onChange={handleChange}>
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
                                    <Button
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
                                    </Button>
                                ) : (
                                    Array.from(selectedValues).map((value) => {
                                        const displayValue = value === NULL_QUERY_VALUE ? '(blank)' : value;
                                        return (
                                            <span
                                                key={value}
                                                className='bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs flex items-center'
                                            >
                                                {displayValue}
                                                <Button
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
                                                </Button>
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
                            <Button
                                className='absolute inset-y-0 right-8 flex items-center pr-2'
                                onClick={handleClear}
                                aria-label={`Clear ${field.displayName ?? field.name}`}
                                type='button'
                            >
                                <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                            </Button>
                        )}
                        <ComboboxButton className='absolute inset-y-0 right-0 flex items-center pr-2'>
                            <MdiChevronUpDown className='w-5 h-5 text-gray-400' />
                        </ComboboxButton>
                    </FloatingLabelContainer>

                    <AutoCompleteDropdown
                        isPending={isPending}
                        filteredOptions={filteredOptions}
                        headerContent={headerContent}
                    />
                </div>
            </Combobox>
        </div>
    );
};
