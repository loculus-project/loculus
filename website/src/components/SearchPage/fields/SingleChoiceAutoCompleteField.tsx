import { type InputHTMLAttributes, forwardRef } from 'react';

import { AsyncCombobox } from './AsyncCombobox.tsx';
import { type OptionsProvider } from './AutoCompleteOptions.ts';
import { TextField } from './TextField.tsx';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';

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
    const handleChange = (v: string | number | null) => {
        const finalValue = v === NULL_QUERY_VALUE ? null : (v ?? '');
        setSomeFieldValues([field.name, finalValue]);
    };

    const handleClear = () => {
        setSomeFieldValues([field.name, '']);
    };

    return (
        <div className='w-full'>
            <AsyncCombobox<string | number | null>
                value={fieldValue}
                onChange={handleChange}
                onClear={handleClear}
                optionsProvider={optionsProvider}
                maxDisplayedOptions={maxDisplayedOptions}
                placeholder={field.displayName ?? field.name}
                inputAs={CustomInput}
                isClearVisible={(val, query) => (val !== '' && val !== undefined) || query !== ''}
            />
        </div>
    );
};
