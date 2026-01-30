import { useEffect, useMemo, useRef, useState } from 'react';

import { createOptionsProviderHook, type OptionsProvider } from './AutoCompleteOptions.ts';
import { FloatingLabelContainer } from './FloatingLabelContainer.tsx';
import { getClientLogger } from '../../../clientLogger.ts';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import { Button } from '../../common/Button';
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '../../common/headlessui/Combobox';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiChevronUpDown from '~icons/mdi/chevron-up-down';
import MdiTick from '~icons/mdi/tick';

const logger = getClientLogger('AutoCompleteField');

type AutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    optionsProvider: OptionsProvider;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValues: (string | null)[];
    maxDisplayedOptions?: number;
};

export const AutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValues,
    maxDisplayedOptions = 1000,
}: AutoCompleteFieldProps) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending: isOptionListPending, error, load } = hook();

    // Single select: take the first value (if any)
    const selectedValue = useMemo<string | null>(() => {
        const v = fieldValues?.[0] ?? null;
        return v === null ? NULL_QUERY_VALUE : v;
    }, [fieldValues]);

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

    // Single select handler
    const handleChange = (value: string | null) => {
        if (!value) {
            setSomeFieldValues([field.name, '']);
            return;
        }
        const convertedValue = value === NULL_QUERY_VALUE ? null : value;
        // Still store as an array to match existing fieldValues type
        setSomeFieldValues([field.name, [convertedValue]]);
    };

    const handleClear = () => {
        setQuery('');
        handleChange(null);
    };

    const hasSelection = selectedValue !== null;

    return (
        <div className='w-full'>
            <Combobox immediate value={selectedValue} onChange={handleChange}>
                <div className='relative'>
                    <FloatingLabelContainer
                        label={field.displayName ?? field.name}
                        isFocused={isFocused}
                        hasContent={hasSelection || query !== ''}
                        className='pr-16'
                        onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (!target.closest('button') && !target.closest('input')) {
                                inputRef.current?.focus();
                            }
                        }}
                    >
                        {hasSelection && (
                            <div className='flex flex-wrap gap-1 p-1 pt-3'>
                                {(() => {
                                    const displayValue = selectedValue === NULL_QUERY_VALUE ? '(blank)' : selectedValue;
                                    return (
                                        <span
                                            key={selectedValue!}
                                            className='bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs flex items-center'
                                        >
                                            {displayValue}
                                            <Button
                                                className='ml-1 text-blue-500 hover:text-blue-700'
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleClear();
                                                }}
                                                aria-label={`Remove ${displayValue}`}
                                                type='button'
                                            >
                                                <MaterialSymbolsClose className='w-3 h-3' />
                                            </Button>
                                        </span>
                                    );
                                })()}
                            </div>
                        )}

                        <ComboboxInput
                            ref={inputRef}
                            className={`flex-grow border-0 outline-none text-sm text-gray-900 bg-transparent appearance-none focus:ring-0 ${
                                hasSelection ? 'px-3 pb-1.5 pt-1' : 'px-2.5 pb-1.5 pt-3'
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

                        {(hasSelection || query !== '') && (
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
                                {/* Removed Select all / none for single select */}
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
                                        {({ focus, selected }) => (
                                            <>
                                                <span
                                                    className={`inline-block ${selected ? 'font-medium' : 'font-normal'} ${
                                                        option.option === '(blank)' ? 'italic' : ''
                                                    }`}
                                                >
                                                    {option.option}
                                                </span>

                                                {/* counts stay exactly the same */}
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
                                        )}
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