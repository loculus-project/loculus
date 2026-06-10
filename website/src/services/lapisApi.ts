// Note: this is the website's client for the Loculus query-service v1 API.
// (See query-service/README.md.) The verbs here mirror the query-service
// surface, not LAPIS's. `organism` is required and passed as a query param.

import { makeApi, makeEndpoint, makeParameters } from '@zodios/core';
import z from 'zod';

import {
    aggregatedResponse,
    detailsResponse,
    insertionsResponse,
    lapisBaseRequest,
    lineageDefinition,
    mutationsRequest,
    mutationsResponse,
    sequenceRequest,
} from '../types/lapis.ts';

function v1<Path extends `/${string}`>(path: Path) {
    return `/v1${path}` as const;
}

// Every /v1/ endpoint takes `?organism=` (required) and may take
// `?include=` (optional) to opt out of query-service's implicit defaults
// (`versionStatus=LATEST_VERSION` and `isRevocation=false`). Valid values:
// `revoked`, `older-versions`, `all`. The search UI passes `all` because
// it manages those defaults itself via hiddenFieldValues.
const organismParam = makeParameters([
    {
        name: 'organism',
        type: 'Query',
        schema: z.string(),
    },
    {
        name: 'include',
        type: 'Query',
        schema: z.string().optional(),
    },
] as const);

const detailsEndpoint = makeEndpoint({
    method: 'post',
    path: v1('/metadata'),
    alias: 'details',
    parameters: [
        ...organismParam,
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: detailsResponse,
});

const aggregatedEndpoint = makeEndpoint({
    method: 'post',
    path: v1('/aggregated'),
    alias: 'aggregated',
    parameters: [
        ...organismParam,
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
    path: v1('/mutations'),
    alias: 'nucleotideMutations',
    parameters: [
        ...organismParam,
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
    path: v1('/aaMutations'),
    alias: 'aminoAcidMutations',
    parameters: [
        ...organismParam,
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
    path: v1('/insertions'),
    alias: 'nucleotideInsertions',
    parameters: [
        ...organismParam,
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
    path: v1('/aaInsertions'),
    alias: 'aminoAcidInsertions',
    parameters: [
        ...organismParam,
        {
            name: 'request',
            type: 'Body',
            schema: lapisBaseRequest,
        },
    ],
    response: insertionsResponse,
});

// Sequences: segment selection is done via ?reference=<segment> query param.
// Omit reference for single-segment organisms; set it for multi-segment ones.
const alignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: v1('/alignedSequences'),
    alias: 'alignedNucleotideSequences',
    immutable: true,
    parameters: [
        ...organismParam,
        {
            name: 'segment',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'reference',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: z.string(),
});

const unalignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: v1('/unalignedSequences'),
    alias: 'unalignedNucleotideSequences',
    immutable: true,
    parameters: [
        ...organismParam,
        {
            name: 'segment',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'reference',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: z.string(),
});

const alignedAminoAcidSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: v1('/aaSequences/:proteinName'),
    alias: 'alignedAminoAcidSequences',
    immutable: true,
    parameters: [
        ...organismParam,
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: z.string(),
});

const lineageDefinitionEndpoint = makeEndpoint({
    method: 'get',
    path: v1('/lineageDefinition'),
    alias: 'lineageDefinition',
    immutable: true,
    parameters: [
        ...organismParam,
        {
            name: 'column',
            type: 'Query',
            schema: z.string(),
        },
    ],
    response: lineageDefinition,
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
    alignedAminoAcidSequencesEndpoint,
    lineageDefinitionEndpoint,
]);
