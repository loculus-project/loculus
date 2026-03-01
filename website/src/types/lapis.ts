import z from 'zod';

import { accessionVersion, type ProblemDetail } from './backend.ts';
import { parseUnixTimestamp } from '../utils/parseUnixTimestamp.ts';

export const orderDirection = z.enum(['ascending', 'descending']);
export type OrderDirection = z.infer<typeof orderDirection>;

export const orderBy = z.object({
    field: z.string(),
    type: orderDirection,
});
export type OrderBy = z.infer<typeof orderBy>;

export const lapisBaseRequest = z
    .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        fields: z.array(z.string()).optional(),
        orderBy: z.array(orderBy).optional(),
    })
    .catchall(z.union([z.string(), z.number(), z.null(), z.array(z.string().nullable())]));
export type LapisBaseRequest = z.infer<typeof lapisBaseRequest>;

export const mutationsRequest = lapisBaseRequest.extend({ minProportion: z.number().optional() });

export const sequenceRequest = lapisBaseRequest.extend({ dataFormat: z.enum(['FASTA', 'NDJSON', 'JSON']) });
export type SequenceRequest = z.infer<typeof sequenceRequest>;

export const mutationProportionCount = z.object({
    mutation: z.string(),
    proportion: z.number(),
    count: z.number(),
    sequenceName: z.string().nullable(),
    mutationFrom: z.string(),
    mutationTo: z.string(),
    position: z.number(),
});
export type MutationProportionCount = z.infer<typeof mutationProportionCount>;

export const mutationsResponse = makeLapisResponse(z.array(mutationProportionCount));
export type MutationsResponse = z.infer<typeof mutationsResponse>;

const insertionCount = z.object({
    insertion: z.string(),
    count: z.number(),
    insertedSymbols: z.string(),
    position: z.number(),
    sequenceName: z.string().nullable(),
});
export type InsertionCount = z.infer<typeof insertionCount>;

export const insertionsResponse = makeLapisResponse(z.array(insertionCount));
export type InsertionsResponse = z.infer<typeof insertionsResponse>;

const metadatum = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Metadatum = z.infer<typeof metadatum>;

const details = z.record(z.string(), metadatum);
export type Details = z.infer<typeof details>;

export const detailsResponse = makeLapisResponse(z.array(details));
export type DetailsResponse = z.infer<typeof detailsResponse>;

const aggregatedItem = z
    .object({ count: z.number() })
    .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]));
export const aggregatedResponse = makeLapisResponse(z.array(aggregatedItem));
export type AggregatedResponse = z.infer<typeof aggregatedResponse>;

const lineageDefinitionEntry = z.object({
    parents: z.array(z.string()).optional(),
    aliases: z.array(z.string()).optional(),
});
export const lineageDefinition = z.record(z.string(), lineageDefinitionEntry);
export type LineageDefinition = z.infer<typeof lineageDefinition>;

function makeLapisResponse<T extends z.ZodType>(data: T) {
    return z.object({
        data,
        info: z.object({
            dataVersion: z.string(),
        }),
    });
}

export type LapisError = {
    error: ProblemDetail;
};

export const versionStatuses = {
    revoked: 'REVOKED',
    revised: 'REVISED',
    latestVersion: 'LATEST_VERSION',
} as const;

export const versionStatusSchema = z.enum([
    versionStatuses.revoked,
    versionStatuses.revised,
    versionStatuses.latestVersion,
]);

export type VersionStatus = z.infer<typeof versionStatusSchema>;

const rawSequenceEntryHistoryEntry = accessionVersion.extend({
    accessionVersion: z.string(),
    versionStatus: versionStatusSchema,
    isRevocation: z.boolean(),
    submittedAtTimestamp: z.number(),
});

export const sequenceEntryHistoryEntry = rawSequenceEntryHistoryEntry.transform((raw) => ({
    ...raw,
    submittedAtTimestamp: parseUnixTimestamp(raw.submittedAtTimestamp),
}));

export const parsedSequenceEntryHistoryEntrySchema = rawSequenceEntryHistoryEntry.extend({
    submittedAtTimestamp: z.string(),
});

export type SequenceEntryHistoryEntry = z.infer<typeof sequenceEntryHistoryEntry>;

export const sequenceEntryHistory = z.array(sequenceEntryHistoryEntry);

export type SequenceEntryHistory = z.infer<typeof sequenceEntryHistory>;

export function getLatestAccessionVersion(
    sequenceEntryHistory: SequenceEntryHistory,
): SequenceEntryHistoryEntry | undefined {
    if (sequenceEntryHistory.length === 0) {
        return undefined;
    }
    const clonedSequenceEntryHistory = [...sequenceEntryHistory];
    return clonedSequenceEntryHistory.sort((a, b) => b.version - a.version)[0];
}

export enum FileType {
    TSV = 'tsv',
    FASTA = 'fa',
}
