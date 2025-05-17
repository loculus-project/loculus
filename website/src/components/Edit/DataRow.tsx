import { type FC } from 'react';
import { Tooltip } from 'react-tooltip';

import { InputField, type KeyValuePair, type Row } from './InputField.tsx';
import type { InputFieldOption } from '../../types/config.ts';
import WarningAmberIcon from '~icons/ic/baseline-warning-amber';
import DangerousTwoToneIcon from '~icons/ic/twotone-dangerous';
import MaterialSymbolsInfoOutline from '~icons/material-symbols/info-outline'; 

type EditableRowProps = {
    label?: string;
    inputField: string;
    row: Row;
    /**
     * Description fields for the tooltip.
     */
    definition?: string;
    guidance?: string;
    example?: string | number;
    /**
     * Options for this row.
     * If given, the input field will have a dropdown to choose an option from.
     */
    options: InputFieldOption[] | undefined;
    onChange: (editedRow: Row) => void;
};

export const EditableDataRow: FC<EditableRowProps> = ({
    label,
    inputField,
    row,
    onChange,
    options,
    definition,
    guidance,
    example,
}) => {
    const colorClassName = row.errors.length > 0 ? 'text-red-600' : row.warnings.length > 0 ? 'text-yellow-600' : '';

    const hasDescription = [definition, guidance, example].some((value) => value !== undefined);

    return (
        <>
            <tr className='table-fixed w-full'>
                <td className={`w-1/4 relative ${colorClassName}`}>
                    <div className='flex items-center gap-1'>
                        <label htmlFor={row.key}>{label ?? row.key}</label>
                        {hasDescription && (
                            <>
                                <MaterialSymbolsInfoOutline
                                    className='inline-block h-4 w-4 text-gray-500'
                                    data-tooltip-id={'field-tooltip' + row.key}
                                />
                                <Tooltip
                                    id={'field-tooltip' + row.key}
                                    place='bottom-start'
                                    className='absolute z-50 top-full left-0 mt-1 max-w-80 space-y-2'
                                >
                                    <p>
                                        <span className='font-mono font-semibold text-gray-300'>{inputField}</span>
                                    </p>
                                    {definition && <p>{definition}</p>}
                                    {guidance && <p>{guidance}</p>}
                                    {example !== undefined && <p className='italic'>Example: {example}</p>}
                                </Tooltip>
                            </>
                        )}
                    </div>
                </td>
                <td className='text-right'>
                    <div className='pr-2 flex flex-row items-center'>
                        <ErrorAndWarningIcons row={row} />
                    </div>
                </td>
                <td className='w-3/4'>
                    <InputField row={row} onChange={onChange} colorClassName={colorClassName} options={options} />
                </td>
            </tr>
            {row.warnings.length + row.errors.length > 0 ? (
                <tr>
                    <td />
                    <td />
                    <td className='text-xs'>
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
                    </td>
                </tr>
            ) : null}
        </>
    );
};

type ErrorAndWarningIconsProps = {
    row: Row;
};
const ErrorAndWarningIcons: FC<ErrorAndWarningIconsProps> = ({ row }) => {
    return (
        <>
            {row.errors.length > 0 ? (
                <div className='tooltip tooltip-error whitespace-pre-line text-error' data-tip={row.errors.join('\n')}>
                    <DangerousTwoToneIcon />
                </div>
            ) : null}
            {row.warnings.length > 0 ? (
                <div
                    className='tooltip tooltip-warning whitespace-pre-line text-warning'
                    data-tip={row.warnings.join('\n')}
                >
                    <WarningAmberIcon />
                </div>
            ) : null}
        </>
    );
};

type ProcessedDataRowProps = {
    label?: string;
    row: KeyValuePair;
};

export const ProcessedDataRow: FC<ProcessedDataRowProps> = ({ label, row }) => (
    <tr>
        <td className={`w-1/4 `}>{label ?? row.key}:</td>
        <td />
        <td className='w-full'>
            <div className='px-3'>{row.value}</div>
        </td>
    </tr>
);
