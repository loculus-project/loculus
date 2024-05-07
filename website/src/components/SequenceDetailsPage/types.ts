import type { CustomDisplay, MetadataType } from '../../types/config.ts';
export type TableDataEntry = {
    label: string;
    name: string;
    value: string | number | boolean;
    header: string;
    customDisplay?: CustomDisplay;
    type: TableDataEntryType;
};

export type TableDataEntryType = { kind: 'metadata'; metadataType: MetadataType } | { kind: 'mutation' };
