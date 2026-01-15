import { z } from 'zod';

import { dataUseTermsHistoryEntry } from './backend.ts';
import { schema } from './config.ts';
import { parsedSequenceEntryHistoryEntrySchema } from './lapis.ts';
import { serviceUrls } from './runtimeConfig.ts';
import { tableDataEntrySchema } from '../components/SequenceDetailsPage/types.ts';

export const detailsJsonSchema = z.object({
    tableData: z.array(tableDataEntrySchema),
    organism: z.string(),
    accessionVersion: z.string(),
    dataUseTermsHistory: z.array(dataUseTermsHistoryEntry),
    schema: schema,
    clientConfig: serviceUrls,
    // Segment-first mode: map of segment names to reference names
    segmentReferences: z.record(z.string(), z.string().nullable()),
    isRevocation: z.boolean(),
    sequenceEntryHistory: z.array(parsedSequenceEntryHistoryEntrySchema),
});

export type DetailsJson = z.infer<typeof detailsJsonSchema>;
