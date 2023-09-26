import type { ClientConfig, Filter } from '../../../types';

export type FieldProps = {
    field: Filter;
    allFields: Filter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    clientConfig: ClientConfig;
};
