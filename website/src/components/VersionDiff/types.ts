import type { TableDataEntry } from '../SequenceDetailsPage/types';

export type FieldComparison = {
    name: string;
    label: string;
    header: string;
    // The full table entry from each version, or null if the field is absent in that
    // version. Kept whole (rather than a stringified value) so the diff can render each
    // cell with the same `DataTableEntryValue` component as the sequence details page,
    // covering all `customDisplay` types (mutations, links, badges, ...).
    entry1: TableDataEntry | null;
    entry2: TableDataEntry | null;
    orderOnDetailsPage?: number;
    hasChanged: boolean;
    isNoisy: boolean;
};

export type ComparisonResult = {
    changedFields: FieldComparison[];
    unchangedFields: FieldComparison[];
    noisyFields: FieldComparison[];
};
