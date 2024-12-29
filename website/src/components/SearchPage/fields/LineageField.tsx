import { useEffect, useState, type FC } from 'react';

import { AutoCompleteField, type Option } from './AutoCompleteField';
import type { MetadataFilter, SetSomeFieldValues } from '../../../types/config';

interface LineageFieldProps {
    lapisUrl: string;
    lapisSearchParameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451) use a proper type
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
    const [includeSublineages, setIncludeSubLineages] = useState(fieldValue.endsWith('*'));
    const [inputText, setInputText] = useState(fieldValue.endsWith('*') ? fieldValue.slice(0, -1) : fieldValue);

    useEffect(() => {
        let queryText = includeSublineages ? `${inputText}*` : inputText;
        if (queryText === '*') queryText = '';
        if (queryText === fieldValue) return;
        setSomeFieldValues([field.name, queryText]);
    }, [includeSublineages, inputText, fieldValue]);

    // A function to modify the options available in the dropdown. It adds prefixes.
    const optionsModifier = (options: Option[]) => {
        const m = new Map<string, number | undefined>(options.map((o) => [o.option, o.count]));
        [...m.keys()].forEach((option) => {
            [...Array(option.length).keys()]
                .slice(1)
                .map((i) => option.slice(0, i))
                .filter((prefix) => !prefix.endsWith('.'))
                .filter((prefix) => !m.has(prefix))
                .forEach((prefix) => m.set(prefix, undefined));
        });
        return [...m.entries()].map(([k, v]) => ({ option: k, count: v }));
    };

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <AutoCompleteField
                field={field}
                lapisUrl={lapisUrl}
                setSomeFieldValues={([_, value]) => {
                    setInputText(value as string);
                }}
                fieldValue={inputText}
                lapisSearchParameters={lapisSearchParameters}
                optionsModifier={optionsModifier}
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
