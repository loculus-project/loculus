import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions, Input } from '@headlessui/react';
import { type FC, useState } from 'react';

import useClientFlag from '../../hooks/isClient';
import type { InputFieldOption } from '../../types/config';
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
    options: InputFieldOption[] | undefined;
};

export const InputField: FC<InputFieldProps> = ({ row, onChange, colorClassName, options }) => {
    const [isFocused, setIsFocused] = useState(false);
    const isClient = useClientFlag();

    const filteredOptions = (options ?? []).filter((o) => o.name.toLowerCase().includes(row.value.toLowerCase()));

    return (
        <>
            {options !== undefined ? (
                <Combobox value={row.value} onChange={(value) => onChange({ ...row, value: value ?? '' })}>
                    <div className='relative inline'>
                        <ComboboxInput
                            onChange={(event) =>
                                onChange({ ...row, value: event.target.value ? event.target.value : '' })
                            }
                            className={`border border-gray-200 rounded-md w-full ${
                                row.value !== row.initialValue ? 'pl-3 pr-12' : 'px-3'
                            }  ${colorClassName} h-8`}
                        />
                        <ComboboxOptions className='absolute border empty:invisible w-full max-h-60'>
                            {filteredOptions.map((option) => (
                                <ComboboxOption
                                    key={option.name}
                                    value={option.name}
                                    className='data-[focus]:bg-blue-100'
                                >
                                    {option.name}
                                </ComboboxOption>
                            ))}
                        </ComboboxOptions>
                    </div>
                </Combobox>
            ) : (
                <Input
                    id={row.key}
                    name={row.key}
                    type='text'
                    className={`border border-gray-200 rounded-md w-full ${
                        row.value !== row.initialValue ? 'pl-3 pr-12' : 'px-3'
                    }  ${colorClassName} h-8`}
                    value={row.value}
                    onChange={(e) => onChange({ ...row, value: e.target.value })}
                    onFocus={() => setIsFocused(() => true)}
                    onBlur={() => setIsFocused(() => false)}
                    disabled={!isClient}
                />
            )}
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
