import type { MetadataFilter } from '../../../types/config.ts';

export type FieldProps = {
    field: MetadataFilter;
    allFields: MetadataFilter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    lapisUrl: string;
};
