import type { FocusEventHandler } from 'react';

import type { MetadataFilter, SetAFieldValue } from '../../../types/config.ts';

export type FieldProps = {
    field: MetadataFilter;
    setAFieldValue: SetAFieldValue;
    isLoading: boolean;
    multiline?: boolean;
    onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    fieldValue: string;
    type?: 'string' | 'boolean' | 'float' | 'int' | 'pangoLineage' | 'authors';
};
