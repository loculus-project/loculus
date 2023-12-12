import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import {
    aggregatedResponse,
    detailsResponse,
    insertionsResponse,
    lapisBaseRequest,
    mutationsRequest,
    mutationsResponse,
} from '../types/lapis.ts';

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

const alignedAminoAcidSequencesEndpoint = makeEndpoint({
    method: 'post',
    path: '/alignedAminoAcidSequences/:gene',
    alias: 'alignedAminoAcidSequences',
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
    alignedAminoAcidSequencesEndpoint,
]);
