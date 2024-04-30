import z, { type ZodTypeAny } from 'zod';

import { accessionVersion, type ProblemDetail } from './backend.ts';
import { parseUnixTimestamp } from '../utils/parseUnixTimestamp.ts';

export const orderByType = z.enum(['ascending', 'descending']);
export type OrderByType = z.infer<typeof orderByType>;

export const orderBy = z.object({
    field: z.string(),
    type: orderByType,
});
export type OrderBy = z.infer<typeof orderBy>;

export const lapisBaseRequest = z
    .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        fields: z.array(z.string()).optional(),
        orderBy: z.array(orderBy).optional(),
    })
    .catchall(z.union([z.string(), z.number(), z.null(), z.array(z.string())]));
export type LapisBaseRequest = z.infer<typeof lapisBaseRequest>;

export const mutationsRequest = lapisBaseRequest.extend({ minProportion: z.number().optional() });

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
});
export type InsertionCount = z.infer<typeof insertionCount>;

export const insertionsResponse = makeLapisResponse(z.array(insertionCount));
export type InsertionsResponse = z.infer<typeof insertionsResponse>;

const metadatum = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Metadatum = z.infer<typeof metadatum>;

const details = z.record(metadatum);
export type Details = z.infer<typeof details>;

export const detailsResponse = makeLapisResponse(z.array(details));
export type DetailsResponse = z.infer<typeof detailsResponse>;

const aggregatedItem = z.object({ count: z.number() }).catchall(z.union([z.string(), z.number(), z.null()]));
export const aggregatedResponse = makeLapisResponse(z.array(aggregatedItem));

function makeLapisResponse<T extends ZodTypeAny>(data: T) {
    return z.object({
        data,
    });
}

export type LapisError = {
    error: ProblemDetail;
};

export const siloVersionStatuses = {
    revoked: 'REVOKED',
    revised: 'REVISED',
    latestVersion: 'LATEST_VERSION',
} as const;

export const siloVersionStatusSchema = z.enum([
    siloVersionStatuses.revoked,
    siloVersionStatuses.revised,
    siloVersionStatuses.latestVersion,
]);

export type SiloVersionStatus = z.infer<typeof siloVersionStatusSchema>;

export const sequenceEntryHistoryEntry = accessionVersion
    .merge(
        z.object({
            accessionVersion: z.string(),
            versionStatus: siloVersionStatusSchema,
            isRevocation: z.boolean(),
            submittedAt: z.number(),
        }),
    )
    .transform((raw) => ({
        ...raw,
        submittedAt: parseUnixTimestamp(raw.submittedAt),
    }));

export type SequenceEntryHistoryEntry = z.infer<typeof sequenceEntryHistoryEntry>;

export const sequenceEntryHistory = z.array(sequenceEntryHistoryEntry);

export type SequenceEntryHistory = z.infer<typeof sequenceEntryHistory>;
