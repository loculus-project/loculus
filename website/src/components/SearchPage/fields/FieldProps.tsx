import type { Config, Filter } from '../../../types';

export type FieldProps = {
    field: Filter;
    allFields: Filter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    config: Config;
};
