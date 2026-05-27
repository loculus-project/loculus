import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import {
    aggregatedResponse,
    detailsResponse,
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

export const queryApi = makeApi([
    detailsEndpoint,
    aggregatedEndpoint,
    nucleotideMutationsEndpoint,
    unalignedNucleotideSequencesEndpoint,
]);
