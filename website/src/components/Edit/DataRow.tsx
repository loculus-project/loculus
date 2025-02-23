import { type FC } from 'react';
import { Tooltip } from 'react-tooltip';

import { InputField, type KeyValuePair, type Row } from './InputField.tsx';
import WarningAmberIcon from '~icons/ic/baseline-warning-amber';
import DangerousTwoToneIcon from '~icons/ic/twotone-dangerous';

type EditableRowProps = {
  label?: string;
  inputField: string;
  row: Row;
  onChange: (editedRow: Row) => void;
};

export const EditableDataRow: FC<EditableRowProps> = ({
  label,
  inputField,
  row,
  onChange,
}) => {
  const hasError = row.errors.length > 0;
  const hasWarning = row.warnings.length > 0;
  const colorClassName = hasError
    ? 'text-red-600'
    : hasWarning
    ? 'text-yellow-600'
    : '';
  const tooltipId = `tooltip-${row.key}`;
  const tooltipContent = `Input metadata name: ${inputField}`;

  return (
    <div className="flex-col">
      <div className="mb-1">
        <label
          htmlFor={row.key}
          className={`text-sm font-medium ${colorClassName}`}
          data-tooltip-id={tooltipId}
        >
          {label ?? row.key}
        </label>
        <ErrorAndWarningIcons row={row} />
        <Tooltip
          id={tooltipId}
          place="bottom-start"
          content={tooltipContent}
          className="z-50 mt-1"
        />
      </div>
      <div className="w-full mb-3">
        <InputField
          row={row}
          onChange={onChange}
          colorClassName={colorClassName}
        />
      </div>
    </div>
  );
};

type ErrorAndWarningIconsProps = {
  row: Row;
};

const ErrorAndWarningIcons: FC<ErrorAndWarningIconsProps> = ({ row }) => {
  return (
    <div className="flex items-center justify-center gap-2">
      {row.errors.length > 0 && (
        <div
          className="tooltip tooltip-error whitespace-pre-line text-error"
          data-tip={row.errors.join('\n')}
        >
          <DangerousTwoToneIcon />
        </div>
      )}
      {row.warnings.length > 0 && (
        <div
          className="tooltip tooltip-warning whitespace-pre-line text-warning"
          data-tip={row.warnings.join('\n')}
        >
          <WarningAmberIcon />
        </div>
      )}
    </div>
  );
};

type ProcessedDataRowProps = {
  label?: string;
  row: KeyValuePair;
};

export const ProcessedDataRow: FC<ProcessedDataRowProps> = ({ label, row }) => (
  <div className="grid sm:grid-cols-3 gap-x-4 items-center">
    <div className="text-sm font-medium">{label ?? row.key}:</div>
    <div />
    <div className="w-full px-3">{row.value}</div>
  </div>
);
