import { AsyncCombobox } from './AsyncCombobox.tsx';
import { type OptionsProvider } from './AutoCompleteOptions.ts';
import { type GroupedMetadataFilter, type MetadataFilter, type SetSomeFieldValues } from '../../../types/config.ts';
import { NULL_QUERY_VALUE } from '../../../utils/search.ts';

type SingleChoiceAutoCompleteFieldProps = {
    field: MetadataFilter | GroupedMetadataFilter;
    optionsProvider: OptionsProvider;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue?: string | null;
    maxDisplayedOptions?: number;
};

export const SingleChoiceAutoCompleteField = ({
    field,
    optionsProvider,
    setSomeFieldValues,
    fieldValue,
    maxDisplayedOptions = 1000,
}: SingleChoiceAutoCompleteFieldProps) => {
    const handleChange = (v: string | null) => {
        const finalValue = v === NULL_QUERY_VALUE ? null : (v ?? '');
        setSomeFieldValues([field.name, finalValue]);
    };

    const handleClear = () => {
        setSomeFieldValues([field.name, '']);
    };

    return (
        <AsyncCombobox<string | null>
            value={fieldValue}
            onChange={handleChange}
            onClear={handleClear}
            optionsProvider={optionsProvider}
            maxDisplayedOptions={maxDisplayedOptions}
            placeholder={field.displayName ?? field.name}
            isClearVisible={(val, query) => (val !== '' && val !== undefined) || query !== ''}
        />
    );
};
