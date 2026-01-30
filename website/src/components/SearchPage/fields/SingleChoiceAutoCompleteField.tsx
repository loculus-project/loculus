import { type InputHTMLAttributes, useState, forwardRef } from 'react';

import { AutoCompleteDropdown, useAutoCompleteOptions } from './AutoCompleteCommon.tsx';
import type { OptionsProvider } from './AutoCompleteOptions.ts';
import { TextField } from './TextField.tsx';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';
import { Button } from '../../common/Button';
import { Combobox, ComboboxButton, ComboboxInput } from '../../common/headlessui/Combobox';
import MaterialSymbolsClose from '~icons/material-symbols/close';
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

type SingleChoiceAutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    optionsProvider: OptionsProvider;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue?: string | number | null;
    maxDisplayedOptions?: number;
};

export const SingleChoiceAutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValue,
    maxDisplayedOptions = 1000,
}: SingleChoiceAutoCompleteFieldProps) => {
    const [query, setQuery] = useState('');
    const { filteredOptions, isPending, load } = useAutoCompleteOptions(optionsProvider, query, maxDisplayedOptions);

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

                    <AutoCompleteDropdown isPending={isPending} filteredOptions={filteredOptions} />
                </div>
            </Combobox>
        </div>
    );
};
