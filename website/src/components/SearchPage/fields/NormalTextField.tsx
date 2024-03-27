import TextField from '@mui/material/TextField';
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';

type NormalTextFieldProps = FieldProps & {
    multiline?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
    inputRef?: React.RefObject<HTMLInputElement>;
};

export const NormalTextField: FC<NormalTextFieldProps> = ({
    field,
    handleFieldChange,
    isLoading,
    multiline = false,
    onFocus,
    onBlur,
    inputRef,
}) => (
    <TextField
        variant='outlined'
        margin='dense'
        label={field.filterValue === '' ? undefined : field.label}
        placeholder={field.filterValue !== '' ? undefined : field.label}
        type={field.type}
        size='small'
        value={field.filterValue}
        disabled={isLoading}
        onChange={(e) => handleFieldChange(field.name, e.target.value)}
        InputLabelProps={{
            shrink: true,
        }}
        inputProps={{
            autoComplete: 'off',
        }}
        multiline={multiline}
        rows={3}
        onFocus={onFocus}
        onBlur={onBlur}
        inputRef={inputRef}
    />
);
