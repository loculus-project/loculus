import type { MetadataFilter } from '../../../types/config.ts';

export type FieldProps = {
    field: MetadataFilter;
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
};
