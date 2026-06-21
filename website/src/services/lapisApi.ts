import { makeApi, makeEndpoint } from '@zodios/core';
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

function withSample<Path extends `/${string}`>(path: Path) {
    return path;
}

const detailsEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/metadata'),
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

const aggregatedEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/aggregated'),
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
    path: withSample('/nucleotide-mutations'),
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
    path: withSample('/amino-acid-mutations'),
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
    path: withSample('/nucleotide-insertions'),
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
    path: withSample('/amino-acid-insertions'),
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
    path: withSample('/aligned-nucleotide-sequences'),
    alias: 'alignedNucleotideSequences',
    immutable: true,
    parameters: [
        {
            name: 'organism',
            type: 'Query',
            schema: z.string().optional(),
        },
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
    path: withSample('/unaligned-nucleotide-sequences'),
    alias: 'unalignedNucleotideSequences',
    immutable: true,
    parameters: [
        {
            name: 'organism',
            type: 'Query',
            schema: z.string().optional(),
        },
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
    path: withSample('/aligned-amino-acid-sequences'),
    alias: 'alignedAminoAcidSequences',
    immutable: true,
    parameters: [
        {
            name: 'organism',
            type: 'Query',
            schema: z.string().optional(),
        },
        {
            name: 'gene',
            type: 'Query',
            schema: z.string(),
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

const lineageDefinitionEndpoint = makeEndpoint({
    method: 'get',
    path: withSample('/lineage-definition/:column'),
    alias: 'lineageDefinition',
    immutable: true,
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
