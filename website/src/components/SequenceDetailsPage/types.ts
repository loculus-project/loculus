import { z } from 'zod';

import type { DataUseTermsHistoryEntry } from '../../types/backend.ts';
import { customDisplay, metadataPossibleTypes } from '../../types/config.ts';
import type { SequenceEntryHistory } from '../../types/lapis.ts';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';

export const tableDataEntryTypeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('metadata'), metadataType: metadataPossibleTypes }),
    z.object({ kind: z.literal('mutation') }),
]);
export type TableDataEntryType = z.infer<typeof tableDataEntryTypeSchema>;

export const tableDataEntrySchema = z.object({
    label: z.string(),
    name: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
    header: z.string(),
    customDisplay: customDisplay.optional(),
    type: tableDataEntryTypeSchema,
    orderOnDetailsPage: z.number().optional(),
});
export type TableDataEntry = z.infer<typeof tableDataEntrySchema>;

export type SequenceData = {
    tableData: TableDataEntry[];
    sequenceEntryHistory: SequenceEntryHistory;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    segmentReferences?: SegmentReferenceSelections;
    isRevocation: boolean;
};
