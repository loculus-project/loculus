import type { FieldValues } from '../../../types/config.ts';

export type FilterDownload = {
    type: 'filter';
    lapisSearchParameters: Record<string, any>;
    hiddenFieldValues: FieldValues;
};

export type SelectDownload = {
    type: 'select';
    selectedSequences: string[];
};

export type DownloadParameters = FilterDownload | SelectDownload;
