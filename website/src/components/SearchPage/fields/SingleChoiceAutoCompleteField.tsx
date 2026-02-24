import { type InputHTMLAttributes, useEffect, useMemo, useState, forwardRef } from 'react';

import { createOptionsProviderHook, type OptionsProvider } from './AutoCompleteOptions.ts';
import { TextField } from './TextField.tsx';
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

const logger = getClientLogger('SingleChoiceAutoCompleteField');

type SingleChoiceAutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    optionsProvider: OptionsProvider;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue?: string | number | null;
    fieldDisplayNameMap?: Map<string, string>;
    maxDisplayedOptions?: number;
};

export const SingleChoiceAutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValue,
    fieldDisplayNameMap,
    maxDisplayedOptions = 1000,
}: SingleChoiceAutoCompleteFieldProps) => {
    const [query, setQuery] = useState('');

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending: isOptionListPending, error, load } = hook();

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
        // Sort options by display name if displayNameMap is provided, otherwise by option value
        const displayedOptions = allMatchedOptions.sort((a, b) =>
            (fieldDisplayNameMap?.get(a.option) ?? a.option).localeCompare(
                fieldDisplayNameMap?.get(b.option) ?? b.option,
                undefined,
                {
                    numeric: true,
                    sensitivity: 'base',
                },
            ),
        );
        return displayedOptions.slice(0, maxDisplayedOptions);
    }, [options, query, maxDisplayedOptions, fieldDisplayNameMap]);

    const handleChange = (value: string | null) => {
        const finalValue = value === NULL_QUERY_VALUE ? null : (value ?? '');
        setSomeFieldValues([field.name, finalValue]);
    };

    const handleClear = () => {
        setQuery('');
        setSomeFieldValues([field.name, '']);
    };

    return (
        <div className='w-full'>
            <Combobox immediate value={fieldValue} onChange={handleChange}>
                <div className='relative'>
                    <>
                        <ComboboxInput
                            displayValue={(value: string | number | null) => {
                                if (value === null || value === NULL_QUERY_VALUE) {
                                    return '(blank)';
                                }
                                return String(value);
                            }}
                            onChange={(event) => setQuery(event.target.value)}
                            onFocus={load}
                            placeholder={field.displayName ?? field.name}
                            as={CustomInput}
                        />
                        {((fieldValue !== '' && fieldValue !== undefined) || query !== '') && (
                            <Button
                                className='absolute inset-y-0 right-8 flex items-center pr-2 h-5 top-4 bg-white rounded-sm'
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
                    </>

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
                                                        {fieldDisplayNameMap?.get(option.option) ?? option.option}
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
