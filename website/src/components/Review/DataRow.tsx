import DangerousTwoToneIcon from '@mui/icons-material/DangerousTwoTone';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { sentenceCase, snakeCase } from 'change-case';
import { type FC } from 'react';

import { InputField, type KeyValuePair, type Row } from './InputField.tsx';

type NonEditableRowProps = {
    row: Row;
    editable: false;
    customKey?: string;
};

type EditableRowProps = {
    row: Row;
    editable: (editedRow: Row) => void;
    customKey?: string;
};

type RowProps = NonEditableRowProps | EditableRowProps;
export const DataRow: FC<RowProps> = ({ row, editable, customKey }) => {
    const colorClassName = row.errors.length > 0 ? 'text-red-600' : row.warnings.length > 0 ? 'text-yellow-600' : '';

    return (
        <tr key={snakeCase(customKey ?? row.key)}>
            <td className={`w-1/4  ${colorClassName}`}>{sentenceCase(row.key)}:</td>
            <td className='pr-3 text-right '>
                <ErrorAndWarningIcons row={row} />
            </td>
            <td className='w-full'>
                {editable === false ? (
                    <div className='px-3'>{row.value}</div>
                ) : (
                    <InputField row={row} onChange={editable} colorClassName={colorClassName} />
                )}
            </td>
        </tr>
    );
};

type ErrorAndWarningIconsProps = {
    row: Row;
};
const ErrorAndWarningIcons: FC<ErrorAndWarningIconsProps> = ({ row }) => {
    return (
        <>
            {row.warnings.length > 0 ? (
                <div className='tooltip tooltip-warning whitespace-pre-line' data-tip={row.warnings.join('\n')}>
                    <WarningAmberIcon color='warning' />
                </div>
            ) : null}
            {row.errors.length > 0 ? (
                <div className='tooltip tooltip-error whitespace-pre-line' data-tip={row.errors.join('\n')}>
                    <DangerousTwoToneIcon color='error' />
                </div>
            ) : null}
        </>
    );
};

type ProcessedDataRowProps = {
    row: KeyValuePair;
    customKey?: string;
};

export const ProcessedDataRow: FC<ProcessedDataRowProps> = ({ row, customKey }) => {
    return (
        <tr key={snakeCase(customKey ?? row.key)}>
            <td className={`w-1/4 `}>{sentenceCase(row.key)}:</td>
            <td />
            <td className='w-full'>
                <div className='px-3'>{row.value}</div>{' '}
            </td>
        </tr>
    );
};
