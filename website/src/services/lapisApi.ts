import z from 'zod';

import { apiPath, sendRequest } from './apiRequest.ts';
import { type RequestOptions } from './backendApi.ts';
import { ProblemDetailError } from './result.ts';
import {
    ACCESSION_FIELD,
    ACCESSION_VERSION_FIELD,
    IS_REVOCATION_FIELD,
    SUBMITTED_AT_FIELD,
    VERSION_FIELD,
    VERSION_STATUS_FIELD,
} from '../settings.ts';
import { accessionVersion } from '../types/backend.ts';
import {
    aggregatedResponse,
    detailsResponse,
    insertionsResponse,
    type LapisRequest,
    lineageDefinition,
    mutationsResponse,
    sequenceEntryHistory,
    versionStatuses,
} from '../types/lapis.ts';
import { fastaEntryToString, parseFasta } from '../utils/parseFasta.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

/** Which LAPIS sequence endpoint to query. `name` is the segment (nucleotide) or gene (amino acid) */
export type SequenceEndpoint =
    { kind: 'unalignedNucleotide' | 'alignedNucleotide'; name?: string } | { kind: 'alignedAminoAcid'; name: string };

function sequencesPath(endpoint: SequenceEndpoint) {
    switch (endpoint.kind) {
        case 'unalignedNucleotide':
            return endpoint.name === undefined
                ? '/sample/unalignedNucleotideSequences'
                : apiPath`/sample/unalignedNucleotideSequences/${endpoint.name}`;
        case 'alignedNucleotide':
            return endpoint.name === undefined
                ? '/sample/alignedNucleotideSequences'
                : apiPath`/sample/alignedNucleotideSequences/${endpoint.name}`;
        case 'alignedAminoAcid':
            return apiPath`/sample/alignedAminoAcidSequences/${endpoint.name}`;
    }
}

function lapisProblem(title: string, detail: string, instance: string) {
    return new ProblemDetailError({ type: 'about:blank', title, status: 500, detail, instance });
}

/**
 * All LAPIS endpoints (and a few helpers on top of them) that don't depend on the organism's schema.
 *
 * Every function takes a single params object and an optional `RequestOptions` object, and throws on errors.
 * - In React components, use `useLapisQuery` / `useLapisMutation` from `hooks/useLapis.ts`.
 * - Server-side, use `serverLapisApi(organism)` from `serverApi.ts`, which returns neverthrow `Result`s.
 */
export function lapisApi(lapisUrl: string) {
    const details = (request: LapisRequest, { signal }: RequestOptions = {}) =>
        sendRequest(lapisUrl, {
            method: 'post',
            path: '/sample/details',
            data: request,
            signal,
            responseSchema: detailsResponse,
        });

    return {
        details,

        aggregated: (request: LapisRequest, { signal }: RequestOptions = {}) =>
            sendRequest(lapisUrl, {
                method: 'post',
                path: '/sample/aggregated',
                data: request,
                signal,
                responseSchema: aggregatedResponse,
            }),

        detailsTsv: (request: LapisRequest, { signal }: RequestOptions = {}) =>
            sendRequest(lapisUrl, {
                method: 'post',
                path: '/sample/details',
                data: { ...request, dataFormat: 'TSV' },
                signal,
                responseSchema: z.string(),
            }),

        mutations: ({ type, ...request }: LapisRequest & { type: BaseType }, { signal }: RequestOptions = {}) =>
            sendRequest(lapisUrl, {
                method: 'post',
                path: type === 'nucleotide' ? '/sample/nucleotideMutations' : '/sample/aminoAcidMutations',
                data: request,
                signal,
                responseSchema: mutationsResponse,
            }),

        insertions: ({ type, ...request }: LapisRequest & { type: BaseType }, { signal }: RequestOptions = {}) =>
            sendRequest(lapisUrl, {
                method: 'post',
                path: type === 'nucleotide' ? '/sample/nucleotideInsertions' : '/sample/aminoAcidInsertions',
                data: request,
                signal,
                responseSchema: insertionsResponse,
            }),

        /** Returns the sequences as FASTA */
        sequencesFasta: (
            {
                endpoint,
                request,
                fastaHeaderTemplate,
            }: { endpoint: SequenceEndpoint; request: LapisRequest; fastaHeaderTemplate?: string },
            { signal }: RequestOptions = {},
        ) =>
            sendRequest(lapisUrl, {
                method: 'post',
                path: sequencesPath(endpoint),
                data: { ...request, dataFormat: 'FASTA', fastaHeaderTemplate },
                signal,
                responseSchema: z.string(),
            }),

        lineageDefinition: ({ column }: { column: string }, { signal }: RequestOptions = {}) =>
            sendRequest(lapisUrl, {
                method: 'get',
                path: apiPath`/sample/lineageDefinition/${column}`,
                signal,
                responseSchema: lineageDefinition,
            }),

        getLatestAccessionVersion: async ({ accession }: { accession: string }, options: RequestOptions = {}) => {
            const { data } = await details(
                { accession, versionStatus: versionStatuses.latestVersion, fields: [ACCESSION_FIELD, VERSION_FIELD] },
                options,
            );
            const instance = 'lapisApi/getLatestAccessionVersion';
            if (data.length !== 1) {
                throw lapisProblem('Unexpected number of results', `Expected 1 result, got ${data.length}`, instance);
            }
            const parsed = accessionVersion.safeParse(data[0]);
            if (!parsed.success) {
                throw lapisProblem('Could not parse accession version', parsed.error.toString(), instance);
            }
            return parsed.data;
        },

        /** All versions of the accession, oldest first */
        getSequenceEntryHistory: async ({ accession }: { accession: string }, options: RequestOptions = {}) => {
            const { data } = await details(
                {
                    accession,
                    fields: [
                        ACCESSION_VERSION_FIELD,
                        ACCESSION_FIELD,
                        VERSION_FIELD,
                        VERSION_STATUS_FIELD,
                        IS_REVOCATION_FIELD,
                        SUBMITTED_AT_FIELD,
                    ],
                    orderBy: [{ field: VERSION_FIELD, type: 'ascending' }],
                },
                options,
            );
            const parsed = sequenceEntryHistory.safeParse(data);
            if (!parsed.success) {
                throw lapisProblem(
                    'Could not get sequence entry history',
                    `Validation error for ${accession}: ${parsed.error.toString()}`,
                    'lapisApi/getSequenceEntryHistory',
                );
            }
            return parsed.data;
        },
    };
}

export type LapisApi = ReturnType<typeof lapisApi>;

/**
 * `lapisApi` plus helpers for a single sequence entry version, which need the organism's primary key.
 */
export function sequenceEntryLapisApi(lapisUrl: string, primaryKey: string) {
    const api = lapisApi(lapisUrl);
    const byKey = (accessionVersion: string) => ({ [primaryKey]: accessionVersion });

    const getSequenceFasta = (
        { accessionVersion, fastaHeaderTemplate }: { accessionVersion: string; fastaHeaderTemplate?: string },
        options: RequestOptions = {},
    ) =>
        api.sequencesFasta(
            { request: byKey(accessionVersion), endpoint: { kind: 'unalignedNucleotide' }, fastaHeaderTemplate },
            options,
        );

    return {
        ...api,

        getSequenceEntryVersionDetails: (
            { accessionVersion }: { accessionVersion: string },
            options?: RequestOptions,
        ) => api.details(byKey(accessionVersion), options),

        getSequenceEntryVersionDetailsTsv: (
            { accessionVersion }: { accessionVersion: string },
            options?: RequestOptions,
        ) => api.detailsTsv(byKey(accessionVersion), options),

        getSequenceMutations: (
            { accessionVersion, type }: { accessionVersion: string; type: BaseType },
            options?: RequestOptions,
        ) => api.mutations({ ...byKey(accessionVersion), type }, options),

        getSequenceInsertions: (
            { accessionVersion, type }: { accessionVersion: string; type: BaseType },
            options?: RequestOptions,
        ) =>
            api.insertions(
                {
                    ...byKey(accessionVersion),
                    type,
                    orderBy: [
                        { field: 'sequenceName', type: 'ascending' },
                        { field: 'position', type: 'ascending' },
                    ],
                },
                options,
            ),

        getSequenceFasta,

        /** One FASTA with all segments; each header gets the segment (or its reference name) as suffix */
        getMultiSegmentSequenceFasta: async (
            {
                accessionVersion,
                segmentNames,
                referenceNameMap,
            }: { accessionVersion: string; segmentNames: string[]; referenceNameMap?: Record<string, string> },
            options: RequestOptions = {},
        ) => {
            const segmentFastas = await Promise.all(
                segmentNames.map((name) =>
                    api.sequencesFasta(
                        { request: byKey(accessionVersion), endpoint: { kind: 'unalignedNucleotide', name } },
                        options,
                    ),
                ),
            );
            return segmentFastas
                .map((fasta, i) => {
                    const parsed = parseFasta(fasta);
                    if (parsed.length === 0) {
                        return '';
                    }
                    const segment = segmentNames[i];
                    return fastaEntryToString([
                        {
                            name: `${parsed[0].name}_${referenceNameMap?.[segment] ?? segment}`,
                            sequence: parsed[0].sequence,
                        },
                    ]);
                })
                .join('');
        },
    };
}
