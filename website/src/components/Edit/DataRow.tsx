import { type FC } from 'react';

import { InputField, type KeyValuePair, type Row } from './InputField.tsx';
import WarningAmberIcon from '~icons/ic/baseline-warning-amber';
import DangerousTwoToneIcon from '~icons/ic/twotone-dangerous';

type EditableRowProps = {
    row: Row;
    onChange: (editedRow: Row) => void;
};

export const EditableDataRow: FC<EditableRowProps> = ({ row, onChange }) => {
    const colorClassName = row.errors.length > 0 ? 'text-red-600' : row.warnings.length > 0 ? 'text-yellow-600' : '';

    return (
        <tr>
            <td className={`w-1/4  ${colorClassName}`}>{row.key}:</td>
            <td className='pr-3 text-right '>
                <ErrorAndWarningIcons row={row} />
            </td>
            <td className='w-full'>
                <InputField row={row} onChange={onChange} colorClassName={colorClassName} />
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
    row: KeyValuePair;
};

export const ProcessedDataRow: FC<ProcessedDataRowProps> = ({ row }) => (
    <tr>
        <td className={`w-1/4 `}>{row.key}:</td>
        <td />
        <td className='w-full'>
            <div className='px-3'>{row.value}</div>
        </td>
    </tr>
);
