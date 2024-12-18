import { useState, type FC } from "react";

import type { FieldValues, MetadataFilter, SetSomeFieldValues } from "../../../types/config";
import { CustomTooltip } from "../../../utils/CustomTooltip";

interface LineageFieldProps {
    field: MetadataFilter;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
}


export const LineageField: FC<LineageFieldProps> = ({ field, fieldValues, setSomeFieldValues }) => {
    const [includeSublineages, setIncludeSubLineages] = useState(true);
    const [inputText, setInputText] = useState('');
    const queryText = includeSublineages ? `${inputText}*` : inputText;

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
        </div>
    );
}
