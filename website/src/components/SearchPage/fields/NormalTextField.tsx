import { forwardRef } from 'react';

import type { FieldProps } from './FieldProps';
import { TextField } from './TextField';

export const NormalTextField = forwardRef<HTMLInputElement, FieldProps>((props, ref) => {
    const { field, handleFieldChange, isLoading, multiline, onFocus, onBlur } = props;

    return (
        <TextField
            label={field.label}
            type={field.type}
            value={field.filterValue}
            disabled={isLoading}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            autoComplete='off'
            multiline={multiline}
            ref={ref}
        />
    );
});
