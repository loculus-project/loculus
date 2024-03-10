import { TextField } from '@mui/material';
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';

type NormalTextFieldProps = FieldProps & {
    multiline?: boolean;
};

export const NormalTextField: FC<NormalTextFieldProps> = ({
    field,
    handleFieldChange,
    isLoading,
    multiline = false,
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
    />
);
