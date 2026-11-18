import z from 'zod';

import type { ApiDefinition } from './apiClient.ts';
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
    return `/sample${path}` as const;
}

export const lapisApi = {
    details: {
        method: 'post',
        path: withSample('/details'),
        body: lapisBaseRequest,
        response: detailsResponse,
    },
    aggregated: {
        method: 'post',
        path: withSample('/aggregated'),
        body: lapisBaseRequest,
        response: aggregatedResponse,
    },
    nucleotideMutations: {
        method: 'post',
        path: withSample('/nucleotideMutations'),
        body: mutationsRequest,
        response: mutationsResponse,
    },
    aminoAcidMutations: {
        method: 'post',
        path: withSample('/aminoAcidMutations'),
        body: mutationsRequest,
        response: mutationsResponse,
    },
    nucleotideInsertions: {
        method: 'post',
        path: withSample('/nucleotideInsertions'),
        body: lapisBaseRequest,
        response: insertionsResponse,
    },
    aminoAcidInsertions: {
        method: 'post',
        path: withSample('/aminoAcidInsertions'),
        body: lapisBaseRequest,
        response: insertionsResponse,
    },
    alignedNucleotideSequences: {
        method: 'post',
        path: withSample('/alignedNucleotideSequences'),
        body: sequenceRequest,
        response: z.string(),
    },
    alignedNucleotideSequencesMultiSegment: {
        method: 'post',
        path: withSample('/alignedNucleotideSequences/:segment'),
        body: sequenceRequest,
        response: z.string(),
    },
    unalignedNucleotideSequences: {
        method: 'post',
        path: withSample('/unalignedNucleotideSequences'),
        body: sequenceRequest,
        response: z.string(),
    },
    unalignedNucleotideSequencesMultiSegment: {
        method: 'post',
        path: withSample('/unalignedNucleotideSequences/:segment'),
        body: sequenceRequest,
        response: z.string(),
    },
    alignedAminoAcidSequences: {
        method: 'post',
        path: withSample('/alignedAminoAcidSequences/:gene'),
        body: sequenceRequest,
        response: z.string(),
    },
    lineageDefinition: {
        method: 'get',
        path: withSample('/lineageDefinition/:column'),
        response: lineageDefinition,
    },
} as const satisfies ApiDefinition;
