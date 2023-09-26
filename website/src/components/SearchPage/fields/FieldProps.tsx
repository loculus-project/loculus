import type { Filter, RuntimeConfig } from '../../../types';

export type FieldProps = {
    field: Filter;
    allFields: Filter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    runtimeConfig: RuntimeConfig;
};
