import { z } from 'zod';

import { DATA_USE_TERMS_FIELD, GROUP_ID_FIELD } from '../../settings.ts';
import { DataUseTermsTypeSchema, restrictedDataUseTermsType, type DataUseTermsType } from '../../types/backend.ts';
import type { CustomDisplay, MetadataType } from '../../types/config.ts';

export type TableDataEntryValue = string | number | boolean;
export type TableDataEntryType = { kind: 'metadata'; metadataType: MetadataType } | { kind: 'mutation' };

export type TableDataEntry = {
    label: string;
    name: string;
    value: TableDataEntryValue;
    header: string;
    customDisplay?: CustomDisplay;
    type: TableDataEntryType;
};

export class TableData {
    public readonly entries: TableDataEntry[];

    constructor(tableData: TableDataEntry[]) {
        this.entries = tableData;
    }

    public get dataUseTerms(): DataUseTermsType {
        return DataUseTermsTypeSchema.parse(this.getEntryByName(DATA_USE_TERMS_FIELD));
    }

    public get isRestricted(): boolean {
        return this.dataUseTerms === restrictedDataUseTermsType;
    }

    public get groupId(): number {
        return z.number().parse(this.getEntryByName(GROUP_ID_FIELD));
    }

    public getEntryByName(entryName: string): TableDataEntryValue | undefined {
        return this.entries.find((entry) => entry.name === entryName)?.value;
    }
}
