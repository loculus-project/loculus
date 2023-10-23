import { makeApi, makeEndpoint } from '@zodios/core';
import z, { type ZodTypeAny } from 'zod';

const lapisBaseRequest = z
    .object({
        limit: z.number().optional(),
        offset: z.number().optional(),
        fields: z.array(z.string()).optional(),
    })
    .catchall(z.union([z.string(), z.number(), z.null(), z.array(z.string())]));
export type LapisBaseRequest = z.infer<typeof lapisBaseRequest>;

const mutationsRequest = lapisBaseRequest.extend({ minProportion: z.number().optional() });

const mutationProportionCount = z.object({
    mutation: z.string(),
    proportion: z.number(),
    count: z.number(),
});
export type MutationProportionCount = z.infer<typeof mutationProportionCount>;

const mutationsResponse = makeLapisResponse(z.array(mutationProportionCount));

const insertionCount = z.object({
    insertion: z.string(),
    count: z.number(),
});
export type InsertionCount = z.infer<typeof insertionCount>;

const insertionsResponse = makeLapisResponse(z.array(insertionCount));

const details = z.record(z.union([z.string(), z.number(), z.null()]));
export type Details = z.infer<typeof details>;

const detailsResponse = makeLapisResponse(z.array(details));
export type DetailsResponse = z.infer<typeof detailsResponse>;

const detailsEndpoint = makeEndpoint({
    method: 'post',
    path: '/details',
    alias: 'details',
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: detailsResponse,
});

const aggregatedItem = z.object({ count: z.number() }).catchall(z.union([z.string(), z.number(), z.null()]));
const aggregatedResponse = makeLapisResponse(z.array(aggregatedItem));

const aggregatedEndpoint = makeEndpoint({
    method: 'post',
    path: '/aggregated',
    alias: 'aggregated',
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: aggregatedResponse,
});

const nucleotideMutationsEndpoint = makeEndpoint({
    method: 'post',
    path: '/nucleotideMutations',
    alias: 'nucleotideMutations',
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: mutationsRequest,
        },
    ],
    response: mutationsResponse,
});

const aminoAcidMutationsEndpoint = makeEndpoint({
    method: 'post',
    path: '/aminoAcidMutations',
    alias: 'aminoAcidMutations',
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: mutationsRequest,
        },
    ],
    response: mutationsResponse,
});

const nucleotideInsertionsEndpoint = makeEndpoint({
    method: 'post',
    path: '/nucleotideInsertions',
    alias: 'nucleotideInsertions',
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: insertionsResponse,
});

const aminoAcidInsertionsEndpoint = makeEndpoint({
    method: 'post',
    path: '/aminoAcidInsertions',
    alias: 'aminoAcidInsertions',
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: insertionsResponse,
});

const alignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/alignedNucleotideSequences',
    alias: 'alignedNucleotideSequences',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: z.string(),
});

const unalignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/unalignedNucleotideSequences',
    alias: 'unalignedNucleotideSequences',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: z.string(),
});

const aminoAcidSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/aminoAcidSequences/:gene',
    alias: 'aminoAcidSequences',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: z.string(),
});

export const lapisApi = makeApi([
    detailsEndpoint,
    aggregatedEndpoint,
    nucleotideMutationsEndpoint,
    aminoAcidMutationsEndpoint,
    nucleotideInsertionsEndpoint,
    aminoAcidInsertionsEndpoint,
    alignedNucleotideSequencesEndpoint,
    unalignedNucleotideSequencesEndpoint,
    aminoAcidSequencesEndpoint,
]);

function makeLapisResponse<T extends ZodTypeAny>(data: T) {
    return z.object({
        data,
    });
}
