import { Combobox, ComboboxButton, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react';
import { type InputHTMLAttributes, useEffect, useMemo, useState, useRef, forwardRef } from 'react';

import { createOptionsProviderHook, type OptionsProvider } from './AutoCompleteOptions.ts';
import { TextField } from './TextField.tsx';
import { getClientLogger } from '../../../clientLogger.ts';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import DisabledUntilHydrated from '../../DisabledUntilHydrated';

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
    maxDisplayedOptions?: number;
};

export const AutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValue,
    maxDisplayedOptions = 1000,
}: AutoCompleteFieldProps) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [query, setQuery] = useState('');

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isLoading: isOptionListLoading, error, load } = hook();

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
    }, [options, query]);

    return (
        <DisabledUntilHydrated>
            <Combobox immediate value={fieldValue} onChange={(value) => setSomeFieldValues([field.name, value ?? ''])}>
                <div className='relative'>
                    <ComboboxInput
                        displayValue={(value: string) => value}
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={load}
                        placeholder={field.displayName ?? field.name}
                        as={CustomInput}
                    />
                    {((fieldValue !== '' && fieldValue !== undefined && fieldValue !== null) || query !== '') && (
                        <button
                            className='absolute inset-y-0 right-8 flex items-center pr-2 h-5 top-4 bg-white rounded-sm'
                            onClick={() => {
                                setQuery('');
                                setSomeFieldValues([field.name, '']);
                            }}
                            aria-label={`Clear ${field.displayName ?? field.name}`}
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
                                    value={option.option}
                                >
                                    {({ selected, focus }) => (
                                        <>
                                            <span
                                                className={`inline-block ${selected ? 'font-medium' : 'font-normal'}`}
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
                                    )}
                                </ComboboxOption>
                            ))
                        )}
                    </ComboboxOptions>
                </div>
            </Combobox>
        </DisabledUntilHydrated>
    );
};
