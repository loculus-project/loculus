import { useEffect, useState, type FC } from 'react';

import { SingleChoiceAutoCompleteField } from './SingleChoiceAutoCompleteField';
import type { MetadataFilter, SetSomeFieldValues } from '../../../types/config';
import { NULL_QUERY_VALUE } from '../../../utils/search';
import type { LapisSearchParameters } from '../DownloadDialog/SequenceFilters';

interface LineageFieldProps {
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
    field: MetadataFilter;
    fieldValue: string;
    setSomeFieldValues: SetSomeFieldValues;
}

export const LineageField: FC<LineageFieldProps> = ({
    field,
    fieldValue,
    setSomeFieldValues,
    lapisUrl,
    lapisSearchParameters,
}) => {
    const [includeSublineages, _setIncludeSubLineages] = useState(fieldValue.endsWith('*'));
    const [inputText, _setInputText] = useState(fieldValue.endsWith('*') ? fieldValue.slice(0, -1) : fieldValue);

    useEffect(() => {
        _setInputText(fieldValue.endsWith('*') ? fieldValue.slice(0, -1) : fieldValue);
        _setIncludeSubLineages(fieldValue.endsWith('*'));
    }, [fieldValue]);

    function queryText(includeSublineages: boolean, inputText: string) {
        let queryText = includeSublineages ? `${inputText}*` : inputText;
        if (queryText === '*') queryText = '';
        return queryText;
    }

    function setIncludeSubLineages(newValue: boolean) {
        _setIncludeSubLineages(newValue);
        setSomeFieldValues([field.name, queryText(newValue, inputText)]);
    }

    function setInputText(newValue: string) {
        _setInputText(newValue);
        setSomeFieldValues([field.name, queryText(includeSublineages, newValue)]);
    }

    const handleChange = (v: string | null) => {
        const finalValue = v === NULL_QUERY_VALUE ? null : (v ?? '');
        setInputText(finalValue!);
    };

    const handleClear = () => {
        setInputText('');
    };

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <SingleChoiceAutoCompleteField<string | null>
                value={inputText}
                onChange={handleChange}
                onClear={handleClear}
                optionsProvider={{
                    type: 'lineage',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                    includeSublineages,
                }}
                placeholder={field.displayName ?? field.name}
            />
            <div className='flex flex-row justify-end'>
                <label>
                    <span className='text-gray-400 text-sm mr-2'>include sublineages</span>
                    <input
                        type='checkbox'
                        className='checkbox checkbox-sm text-3xl [--chkbg:white] [--chkfg:theme(colors.gray.700)] checked:border-gray-300'
                        checked={includeSublineages}
                        onChange={(event) => setIncludeSubLineages(event.target.checked)}
                    />
                </label>
            </div>
        </div>
    );
};
