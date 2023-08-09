import { TextField } from '@mui/material';
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';

export const NormalTextField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
    <TextField
        variant='outlined'
        margin='dense'
        label={field.filter === '' ? undefined : field.label}
        placeholder={field.filter !== '' ? undefined : field.label}
        type={field.type}
        size='small'
        value={field.filter}
        disabled={isLoading}
        onChange={(e) => handleFieldChange(field.name, e.target.value)}
        InputLabelProps={{
            shrink: true,
        }}
    />
);
