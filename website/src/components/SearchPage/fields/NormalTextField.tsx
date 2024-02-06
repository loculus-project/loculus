import { TextField } from '@mui/material';
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';

export const NormalTextField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
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
    />
);
