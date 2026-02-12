import { useEffect, useMemo, useState, type InputHTMLAttributes, forwardRef, type ReactNode } from 'react';

import { createOptionsProviderHook, type OptionsProvider } from './AutoCompleteOptions.ts';
import { TextField } from './TextField.tsx';
import { getClientLogger } from '../../../clientLogger.ts';
import { formatNumberWithDefaultLocale } from '../../../utils/formatNumber.tsx';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import { Button } from '../../common/Button.tsx';
import {
    Combobox,
    ComboboxButton,
    ComboboxInput,
    ComboboxOption,
    ComboboxOptions,
} from '../../common/headlessui/Combobox.tsx';
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
        floatingLabelClassName='bg-white'
    />
));

export type CustomInputElement = React.ElementRef<typeof CustomInput>;

const logger = getClientLogger('SingleChoiceAutoCompleteField');

type Option = { option: string; value: string | number | null; count?: number };

type SingleChoiceAutoCompleteFieldProps<TValue extends string | number | null> = {
    value: TValue | undefined;

    optionsProvider: OptionsProvider;

    placeholder?: string;
    inputId?: string;

    onClear?: () => void;
    onChange: (next: TValue) => void;

    displayValue?: (value: TValue) => string;
    renderOptionLabel?: (opt: Option) => ReactNode;

    maxDisplayedOptions?: number;
};

export const SingleChoiceAutoCompleteField = <TValue extends string | number | null>({
    value,
    onChange,
    optionsProvider,
    placeholder,
    inputId,
    onClear,
    displayValue,
    renderOptionLabel,
    maxDisplayedOptions = 1000,
}: SingleChoiceAutoCompleteFieldProps<TValue>) => {
    const [query, setQuery] = useState('');

    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending, error, load } = hook();

    useEffect(() => {
        if (error) {
            void logger.error(`Error while loading autocomplete options: ${error.message} - ${error.stack}`);
        }
    }, [error]);

    const filteredOptions = useMemo(() => {
        const allMatched =
            query === '' ? options : options.filter((o) => o.option.toLowerCase().includes(query.toLowerCase()));
        return allMatched.slice(0, maxDisplayedOptions);
    }, [options, query, maxDisplayedOptions]);

    const defaultDisplayValue = (v: TValue) => {
        if (v === null || v === NULL_QUERY_VALUE) return '(blank)';
        return String(v);
    };

    const defaultRenderOptionLabel = (opt: Option) => {
        const label =
            opt.count !== undefined ? `${opt.option}(${formatNumberWithDefaultLocale(opt.count)})` : opt.option;

        return <span className={`inline-block ${opt.option === '(blank)' ? 'italic' : ''}`}>{label}</span>;
    };

    const handleSelect = (next: TValue) => {
        onChange(next);
        setQuery('');
    };

    const handleClear = () => {
        setQuery('');
        if (onClear) onClear();
        else onChange('' as TValue);
    };

    return (
        <div className='w-full'>
            <Combobox value={value} onChange={handleSelect} immediate>
                <div className='relative'>
                    <ComboboxInput
                        id={inputId}
                        displayValue={(v: TValue) => (displayValue ?? defaultDisplayValue)(v)}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={load}
                        as={CustomInput}
                        placeholder={placeholder}
                    />

                    {(String(value ?? '') !== '' || query !== '') && (
                        <Button
                            className='absolute top-2 right-8 flex items-center pr-2 h-5 bg-white rounded-sm'
                            onClick={handleClear}
                            aria-label={`Clear ${placeholder}`}
                            type='button'
                        >
                            <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                        </Button>
                    )}

                    <ComboboxButton className='absolute inset-y-0 right-0 flex items-center pr-2'>
                        <MdiChevronUpDown className='w-5 h-5 text-gray-400' />
                    </ComboboxButton>

                    <ComboboxOptions
                        modal={false}
                        className='absolute z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm min-h-32'
                    >
                        {isPending ? (
                            <div className='px-4 py-2 text-gray-500'>Loading...</div>
                        ) : filteredOptions.length === 0 ? (
                            <div className='px-4 py-2 text-gray-500'>No options available</div>
                        ) : (
                            filteredOptions.map((opt: Option) => (
                                <ComboboxOption
                                    key={String(opt.value)}
                                    value={opt.value as TValue}
                                    className={({ focus }) =>
                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                            focus ? 'bg-blue-500 text-white' : 'text-gray-900'
                                        }`
                                    }
                                >
                                    {({ focus, selected }) => (
                                        <>
                                            <span
                                                className={`inline-block ${selected ? 'font-medium' : 'font-normal'}`}
                                            >
                                                {(renderOptionLabel ?? defaultRenderOptionLabel)(opt)}
                                            </span>

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
                            ))
                        )}
                    </ComboboxOptions>
                </div>
            </Combobox>
        </div>
    );
};
