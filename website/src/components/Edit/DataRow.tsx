import { type FC } from 'react';
import { Tooltip } from 'react-tooltip';

import { InputField, type KeyValuePair, type Row } from './InputField.tsx';
import type { InputFieldOption } from '../../types/config.ts';
import WarningAmberIcon from '~icons/ic/baseline-warning-amber';
import DangerousTwoToneIcon from '~icons/ic/twotone-dangerous';

type EditableRowProps = {
    label?: string;
    inputField: string;
    row: Row;
    /**
     * Options for this row.
     * If given, the input field will have a dropdown to choose an option from.
     */
    options: InputFieldOption[] | undefined;
    onChange: (editedRow: Row) => void;
};

export const EditableDataRow: FC<EditableRowProps> = ({ label, inputField, row, onChange, options }) => {
    const colorClassName = row.errors.length > 0 ? 'text-red-600' : row.warnings.length > 0 ? 'text-yellow-600' : '';

    const content = `input metadata name: ${inputField}`;

    return (
        <>
            <tr className='table-fixed w-full'>
                <td className={`w-1/4 relative ${colorClassName}`} data-tooltip-id={'field-tooltip' + row.key}>
                    <label htmlFor={row.key}>{`${label ?? row.key}:`}</label>
                    <Tooltip
                        id={'field-tooltip' + row.key}
                        place='bottom-start'
                        content={content}
                        className='absolute z-50 top-full left-0 mt-1'
                    />
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
