import { Input } from '@headlessui/react';
import { type FC } from 'react';

import type { InputFieldOption } from '../../types/config';
import { Button } from '../common/Button';
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '../common/headlessui/Combobox';
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
    const filteredOptions = (options ?? []).filter((o) => o.name.toLowerCase().includes(row.value.toLowerCase()));

    return (
        <>
            {options !== undefined ? (
                <Combobox immediate value={row.value} onChange={(value) => onChange({ ...row, value: value ?? '' })}>
                    <div className='relative inline'>
                        <ComboboxInput
                            id={row.key}
                            name={row.key}
                            onChange={(event) =>
                                onChange({ ...row, value: event.target.value ? event.target.value : '' })
                            }
                            className={`border border-gray-200 rounded-md w-full ${
                                row.value !== row.initialValue ? 'pl-3 pr-12' : 'px-3'
                            }  ${row.value === row.initialValue && colorClassName} h-8`}
                            autoComplete='none'
                        />
                        <ComboboxOptions
                            modal={false}
                            className='absolute border empty:invisible z-20 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm min-h-32'
                        >
                            {filteredOptions.map((option) => (
                                <ComboboxOption
                                    key={option.name}
                                    value={option.name}
                                    className={({ focus }) =>
                                        `relative cursor-default select-none py-2 pl-10 pr-4 ${
                                            focus ? 'bg-blue-500 text-white' : 'text-gray-900'
                                        }`
                                    }
                                >
                                    {({ selected, focus }) => (
                                        <>
                                            <span
                                                className={`inline-block ${selected ? 'font-medium' : 'font-normal'}`}
                                            >
                                                {option.name}
                                            </span>
                                            {selected && (
                                                <span
                                                    className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                                                        focus ? 'text-white' : 'text-blue-500'
                                                    }`}
                                                >
                                                    <svg className='w-5 h-5' fill='currentColor' viewBox='0 0 20 20'>
                                                        <path
                                                            fillRule='evenodd'
                                                            d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                                                            clipRule='evenodd'
                                                        />
                                                    </svg>
                                                </span>
                                            )}
                                        </>
                                    )}
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
                />
            )}
            <Button
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
            </Button>
        </>
    );
};
