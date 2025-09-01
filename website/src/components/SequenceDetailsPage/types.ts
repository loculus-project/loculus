import { z } from 'zod';

import { customDisplay, metadataPossibleTypes } from '../../types/config.ts';

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
