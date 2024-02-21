
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';
import { TextField } from '../../common/TextField';


export const NormalTextField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
   
    <TextField
        label={field.label}
        type={field.type}
        value={field.filterValue}
        disabled={isLoading}
        onChange={(e) => handleFieldChange(field.name, e.target.value)}
        autoComplete='off'
    />
);
