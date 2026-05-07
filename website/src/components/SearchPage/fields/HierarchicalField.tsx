import { useEffect, useState, type FC } from 'react';

import { SingleChoiceAutoCompleteField } from './SingleChoiceAutoCompleteField';
import type { MetadataFilter, SetSomeFieldValues } from '../../../types/config';
import type { LapisSearchParameters } from '../DownloadDialog/SequenceFilters';

export type HierarchicalFieldMode = 'lineage' | 'default';

interface ModeConfig {
    defaultIncludeSublineages: boolean;
    includeZeroCounts: boolean;
    showAlias: boolean;
    checkBoxLabel: string;
}

const MODE_CONFIGS: Record<HierarchicalFieldMode, ModeConfig> = {
    lineage: {
        defaultIncludeSublineages: false,
        includeZeroCounts: true,
        showAlias: false,
        checkBoxLabel: 'include sublineages',
    },
    default: {
        defaultIncludeSublineages: true,
        includeZeroCounts: false,
        showAlias: true,
        checkBoxLabel: 'include subcategories',
    }
};

interface HierarchicalFieldProps {
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
    field: MetadataFilter;
    fieldValue: string;
    setSomeFieldValues: SetSomeFieldValues;
    mode?: HierarchicalFieldMode;
    hierarchicalSearchText?: string;
}

export const HierarchicalField: FC<HierarchicalFieldProps> = ({
    field,
    fieldValue,
    setSomeFieldValues,
    lapisUrl,
    lapisSearchParameters,
    hierarchicalSearchText = null,
    mode = 'default',
}) => {
    const { defaultIncludeSublineages, includeZeroCounts, showAlias: showAlias, checkBoxLabel: defaultCheckBoxLabel } = MODE_CONFIGS[mode];
    const checkBoxLabel = hierarchicalSearchText ?? defaultCheckBoxLabel;

    const [includeSublineages, _setIncludeSubLineages] = useState(
        fieldValue.endsWith('*') || (fieldValue === '' && defaultIncludeSublineages),
    );
    const [inputText, _setInputText] = useState(fieldValue.endsWith('*') ? fieldValue.slice(0, -1) : fieldValue);

    useEffect(() => {
        _setInputText(fieldValue.endsWith('*') ? fieldValue.slice(0, -1) : fieldValue);
        _setIncludeSubLineages(fieldValue.endsWith('*') || (fieldValue === '' && defaultIncludeSublineages));
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

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <SingleChoiceAutoCompleteField
                field={field}
                optionsProvider={{
                    type: 'lineage',
                    lapisUrl,
                    lapisSearchParameters,
                    fieldName: field.name,
                    includeSublineages,
                    showAlias: showAlias,
                    includeZeroCounts,
                }}
                setSomeFieldValues={([_, value]) => {
                    setInputText(value as string);
                }}
                fieldValue={inputText}
            />
            <div className='flex flex-row justify-end'>
                <label>
                    <span className='text-gray-400 text-sm mr-2'>{checkBoxLabel}</span>
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
