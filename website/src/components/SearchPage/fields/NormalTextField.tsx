import { forwardRef } from 'react';

import type { FieldProps } from './FieldProps';
import { TextField } from './TextField';

export const NormalTextField = forwardRef<HTMLInputElement, FieldProps>((props, ref) => {
    const { field, setAFieldValue, isLoading, multiline, onFocus, onBlur, fieldValue } = props;

    return (
        <TextField
            label={field.label}
            type={field.type}
            value={fieldValue}
            disabled={isLoading}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => setAFieldValue(field.name, e.target.value)}
            autoComplete='off'
            multiline={multiline}
            ref={ref}
        />
    );
});
