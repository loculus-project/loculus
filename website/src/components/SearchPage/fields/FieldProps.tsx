import type { Filter } from '../../../types/config.ts';

export type FieldProps = {
    field: Filter;
    allFields: Filter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    lapisUrl: string;
};
