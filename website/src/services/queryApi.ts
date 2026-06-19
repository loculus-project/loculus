import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import {
    aggregatedResponse,
    detailsResponse,
    insertionsResponse,
    lapisBaseRequest,
    mutationsRequest,
    mutationsResponse,
    sequenceRequest,
} from '../types/lapis.ts';

const detailsEndpoint = makeEndpoint({
    method: 'post',
    path: '/metadata',
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
    path: '/sequencesAligned/mutations',
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
    path: '/translations/mutations',
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
    path: '/sequencesAligned/insertions',
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
    path: '/translations/insertions',
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

const unalignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/sequences',
    alias: 'unalignedNucleotideSequences',
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
    path: '/sequences/:segment',
    alias: 'unalignedNucleotideSequencesMultiSegment',
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

const alignedNucleotideSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/sequencesAligned',
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
    path: '/sequencesAligned/:segment',
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

const alignedAminoAcidSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/translations/:gene',
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

export const queryApi = makeApi([
    detailsEndpoint,
    aggregatedEndpoint,
    nucleotideMutationsEndpoint,
    aminoAcidMutationsEndpoint,
    nucleotideInsertionsEndpoint,
    aminoAcidInsertionsEndpoint,
    unalignedNucleotideSequencesEndpoint,
    unalignedNucleotideSequencesMultiSegmentEndpoint,
    alignedNucleotideSequencesEndpoint,
    alignedNucleotideSequencesMultiSegmentEndpoint,
    alignedAminoAcidSequencesEndpoint,
]);
