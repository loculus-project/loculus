import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import {
    aggregatedResponse,
    detailsResponse,
    insertionsResponse,
    lapisBaseRequest,
    mutationsRequest,
    mutationsResponse,
    sequenceEntries,
    sequenceRequest,
} from '../types/lapis.ts';

function withSample<Path extends `/${string}`>(path: Path) {
    return `/sample${path}` as const;
}

const detailsEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/details'),
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
    path: withSample('/nucleotideMutations'),
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
    path: withSample('/aminoAcidMutations'),
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
    path: withSample('/nucleotideInsertions'),
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
    path: withSample('/aminoAcidInsertions'),
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
    path: withSample('/alignedNucleotideSequences'),
    alias: 'alignedNucleotideSequences',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: z.string(),
});

const alignedNucleotideSequencesMultiSegmentEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/alignedNucleotideSequences/:segment'),
    alias: 'alignedNucleotideSequencesMultiSegment',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: z.string(),
});

const unalignedNucleotideSequencesMultiSegmentEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/unalignedNucleotideSequences/:segment'),
    alias: 'unalignedNucleotideSequencesMultiSegment',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: sequenceEntries,
});

const unalignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/unalignedNucleotideSequences'),
    alias: 'unalignedNucleotideSequences',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
        },
    ],
    response: sequenceEntries,
});

const alignedAminoAcidSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: withSample('/alignedAminoAcidSequences/:gene'),
    alias: 'alignedAminoAcidSequences',
    immutable: true,
    parameters: [
        {
            name: 'request',
            type: 'Body',
            schema: sequenceRequest,
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
    alignedNucleotideSequencesMultiSegmentEndpoint,
    unalignedNucleotideSequencesEndpoint,
    unalignedNucleotideSequencesMultiSegmentEndpoint,
    alignedAminoAcidSequencesEndpoint,
]);
