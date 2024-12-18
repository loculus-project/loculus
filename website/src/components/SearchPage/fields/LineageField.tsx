import { useEffect, useState, type FC } from "react";

import { TextField } from "./TextField";
import type { MetadataFilter, SetSomeFieldValues } from "../../../types/config";

interface LineageFieldProps {
    field: MetadataFilter;
    fieldValue: string;
    setSomeFieldValues: SetSomeFieldValues;
}

export const LineageField: FC<LineageFieldProps> = ({ field, fieldValue, setSomeFieldValues }) => {

    const [includeSublineages, setIncludeSubLineages] = useState(fieldValue.endsWith('*'));
    const [inputText, setInputText] = useState(fieldValue.endsWith('*') ? fieldValue.slice(0, -1) : fieldValue);

    useEffect(() => {
        const queryText = includeSublineages ? `${inputText}*` : inputText;
        if (queryText === fieldValue) return;
        setSomeFieldValues([field.name, queryText]);
    }, [includeSublineages, inputText, fieldValue])

    return (
        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
            <div className='flex flex-row justify-between items-baseline mb-2'>
                <h3 className='text-gray-500 text-sm'>{field.displayName}</h3>
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
            <TextField
                label={field.label}
                type={field.type}
                fieldValue={inputText}
                onChange={(e) => setInputText(e.target.value)}
                autoComplete='off'
            />
        </div>
    );
}
