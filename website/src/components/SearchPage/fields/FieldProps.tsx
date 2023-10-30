import type { Filter } from '../../../types/config.ts';
import type { ClientConfig } from '../../../types/runtimeConfig.ts';

export type FieldProps = {
    field: Filter;
    allFields: Filter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    clientConfig: ClientConfig;
};
