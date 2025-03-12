import { type FC, useState } from 'react';

import useClientFlag from '../../hooks/isClient';
import UndoTwoToneIcon from '~icons/ic/twotone-undo';

export type KeyValuePair = {
    value: string;
    key: string;
};

export type Row = {
    warnings: string[];
    errors: string[];
    initialValue: string;
} & KeyValuePair;

type InputFieldProps = {
    row: Row;
    onChange: (editedRow: Row) => void;
    colorClassName: string;
};

export const InputField: FC<InputFieldProps> = ({ row, onChange, colorClassName }) => {
    const [isFocused, setIsFocused] = useState(false);
    const isClient = useClientFlag();
    return (
        <>
            <input
                id={row.key}
                name={row.key}
                className={`border border-gray-200 rounded-md w-full ${
                    row.value !== row.initialValue ? 'pl-3 pr-12' : 'px-3'
                }  ${colorClassName}`}
                value={row.value}
                onChange={(e) => onChange({ ...row, value: e.target.value })}
                onFocus={() => setIsFocused(() => true)}
                onBlur={() => setIsFocused(() => false)}
                disabled={!isClient}
            />
            <button
                className='bg-white bg-opacity-50 rounded-lg -m-12 px-3'
                onClick={() => onChange({ ...row, value: row.initialValue })}
            >
                {row.value !== row.initialValue && (
                    <div
                        className='tooltip tooltip-info whitespace-pre-line'
                        data-tip={'Revert to: ' + row.initialValue}
                    >
                        <UndoTwoToneIcon color='action' />
                    </div>
                )}
            </button>
            {isFocused && row.warnings.length + row.errors.length > 0 ? (
                <div className='absolute bg-white border border-gray-400 rounded-md p-2 mt-1 align-top'>
                    {row.errors.map((error) => (
                        <div key={error} className='text-red-600'>
                            {error}
                        </div>
                    ))}
                    {row.warnings.map((warning) => (
                        <div key={warning} className='text-yellow-600'>
                            {warning}
                        </div>
                    ))}
                </div>
            ) : null}
        </>
    );
};
