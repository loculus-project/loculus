import type { FocusEventHandler } from 'react';

import type { MetadataFilter } from '../../../types/config.ts';

export type FieldProps = {
    field: MetadataFilter;
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    multiline?: boolean;
    onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
};
