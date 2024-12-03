import { forwardRef, type FocusEventHandler } from 'react';

import { TextField } from './TextField';
import type { MetadataFilter, SetSomeFieldValues } from '../../../types/config.ts';

export type NormalFieldProps = {
    field: MetadataFilter;
    setSomeFieldValues: SetSomeFieldValues;
    multiline?: boolean;
    onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    fieldValue: string | number;
    type?: 'string' | 'boolean' | 'float' | 'int' | 'pango_lineage' | 'authors';
};

export const NormalTextField = forwardRef<HTMLInputElement, NormalFieldProps>((props, ref) => {
    const { field, setSomeFieldValues, multiline, onFocus, onBlur, fieldValue } = props;

    return (
        <TextField
            label={field.label}
            type={field.type}
            fieldValue={fieldValue}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => setSomeFieldValues([field.name, e.target.value])}
            autoComplete='off'
            multiline={multiline}
            ref={ref}
        />
    );
});
