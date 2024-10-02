import type { FieldValues } from '../../../types/config.ts';

export type FilterDownload = {
    type: 'filter';
    lapisSearchParameters: Record<string, any>;
    hiddenFieldValues: FieldValues;
};

export type SelectDownload = {
    type: 'select';
    selectedSequences: Set<string>;
};

/**
 * Either the sequences to download are specified as a bunch of filters,
 * or sequences are specified directly by ID.
 */
export type DownloadParameters = FilterDownload | SelectDownload;
