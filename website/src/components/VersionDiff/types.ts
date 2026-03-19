import type { TableDataEntryType } from '../SequenceDetailsPage/types';

export type FieldComparison = {
    name: string;
    label: string;
    header: string;
    value1: string | number | boolean;
    value2: string | number | boolean;
    type: TableDataEntryType;
    hasChanged: boolean;
    isNoisy: boolean;
};

export type ComparisonResult = {
    changedFields: FieldComparison[];
    unchangedFields: FieldComparison[];
    noisyFields: FieldComparison[];
};
