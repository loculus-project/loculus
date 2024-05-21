import { forwardRef, type FocusEventHandler } from 'react';

import { TextField } from './TextField';
import type { MetadataFilter } from '../../../types/config.ts';

export type NormalFieldProps = {
    field: MetadataFilter;
    setAFieldValue: (metadataName: string, filter: string) => void;
    multiline?: boolean;
    onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    fieldValue: string;
    type?: 'string' | 'boolean' | 'float' | 'int' | 'pango_lineage' | 'authors';
};

export const NormalTextField = forwardRef<HTMLInputElement, NormalFieldProps>((props, ref) => {
    const { field, setAFieldValue, multiline, onFocus, onBlur, fieldValue } = props;

    return (
        <TextField
            label={field.label}
            type={field.type}
            fieldValue={fieldValue}
            onFocus={onFocus}
            onBlur={onBlur}
            onChange={(e) => setAFieldValue(field.name, e.target.value)}
            autoComplete='off'
            multiline={multiline}
            ref={ref}
        />
    );
});
