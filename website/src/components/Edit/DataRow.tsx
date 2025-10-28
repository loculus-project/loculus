import { sentenceCase } from 'change-case';
import { type FC } from 'react';

import { InputField as InputFieldComponent, type Row } from './InputField.tsx';
import type { InputField } from '../../types/config.ts';
import { InputFieldTooltip } from '../Submission/InputFieldTooltip.tsx';
import WarningAmberIcon from '~icons/ic/baseline-warning-amber';
import DangerousTwoToneIcon from '~icons/ic/twotone-dangerous';
import MaterialSymbolsInfoOutline from '~icons/material-symbols/info-outline';

type EditableRowProps = {
    inputField: InputField;
    row: Row;
    onChange: (editedRow: Row) => void;
};

export const EditableDataRow: FC<EditableRowProps> = ({ inputField, row, onChange }) => {
    const colorClassName = row.errors.length > 0 ? 'text-red-600' : row.warnings.length > 0 ? 'text-yellow-600' : '';

    const hasDescription = [inputField.definition, inputField.guidance, inputField.example].some(
        (value) => value !== undefined,
    );

    const label = inputField.displayName ?? sentenceCase(inputField.name);

    // split label to attach icon later on to prevent the icon wrapping alone
    // (https://www.codemzy.com/blog/prevent-icon-wrap-javascript)
    const labelArr = label.trim().split(' ');
    const lastWord = labelArr.pop();
    const startOfLabel = labelArr.join(' ');

    return (
        <>
            <tr className='table-fixed w-full'>
                <td className={`w-1/4 relative ${colorClassName}`}>
                    <label htmlFor={row.key}>
                        {startOfLabel.length > 0 && <span>{startOfLabel} </span>}
                        <span className='whitespace-nowrap'>
                            {lastWord}
                            {hasDescription && (
                                <>
                                    <MaterialSymbolsInfoOutline
                                        className='inline-block h-4 w-4 text-gray-500 shrink-0 ml-1 mb-0.5'
                                        data-tooltip-id={'field-tooltip' + row.key}
                                    />
                                    <InputFieldTooltip
                                        id={'field-tooltip' + row.key}
                                        field={inputField}
                                        includeExample={true}
                                    />
                                </>
                            )}
                        </span>
                    </label>
                </td>
                <td className='text-right'>
                    <div className='pr-2 flex flex-row items-center'>
                        <ErrorAndWarningIcons row={row} />
                    </div>
                </td>
                <td className='w-3/4'>
                    <InputFieldComponent
                        row={row}
                        onChange={onChange}
                        colorClassName={colorClassName}
                        options={inputField.options}
                    />
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
