import type { Readable } from 'stream';

import axios from 'axios';
import { err, ok, Result } from 'neverthrow';
import z from 'zod';

import { ApiClient } from './apiClient.ts';
import { apiPath } from './apiRequest.ts';
import { getLapisUrl, getRuntimeConfig, getSchema } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import {
    ACCESSION_FIELD,
    ACCESSION_VERSION_FIELD,
    IS_REVOCATION_FIELD,
    SUBMITTED_AT_FIELD,
    VERSION_FIELD,
    VERSION_STATUS_FIELD,
} from '../settings.ts';
import { accessionVersion, type AccessionVersion, type ProblemDetail } from '../types/backend.ts';
import type { Schema } from '../types/config.ts';
import {
    aggregatedResponse,
    type AggregatedResponse,
    detailsResponse,
    type DetailsResponse,
    insertionsResponse,
    type LapisRequest,
    mutationsResponse,
    sequenceEntryHistory,
    type SequenceEntryHistory,
    versionStatuses,
} from '../types/lapis.ts';
import { fastaEntryToString, parseFasta } from '../utils/parseFasta.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

/** LAPIS wraps problem details in an `error` field */
function extractLapisProblemDetail(responseData: unknown): unknown {
    if (typeof responseData === 'object' && responseData !== null && 'error' in responseData) {
        return typeof responseData.error === 'object' ? responseData.error : responseData;
    }
    return responseData;
}

export class LapisClient extends ApiClient {
    constructor(
        url: string,
        logger: InstanceLogger,
        private readonly schema: Schema,
    ) {
        super(url, extractLapisProblemDetail, logger, 'LAPIS');
    }

    public static createForOrganism(organism: string) {
        return this.create(getLapisUrl(getRuntimeConfig().serverSide, organism), getSchema(organism));
    }

    public static create(lapisUrl: string, schema: Schema, logger: InstanceLogger = getInstanceLogger('lapisClient')) {
        return new LapisClient(lapisUrl, logger, schema);
    }

    public getDetails(request: LapisRequest): Promise<Result<DetailsResponse, ProblemDetail>> {
        return this.request({
            method: 'post',
            path: '/sample/details',
            data: request,
            responseSchema: detailsResponse,
        });
    }

    public getAggregated(request: LapisRequest): Promise<Result<AggregatedResponse, ProblemDetail>> {
        return this.request({
            method: 'post',
            path: '/sample/aggregated',
            data: request,
            responseSchema: aggregatedResponse,
        });
    }

    public getSequenceEntryVersionDetails(accessionVersion: string) {
        return this.getDetails({ [this.schema.primaryKey]: accessionVersion });
    }

    public getSequenceEntryVersionDetailsTsv(accessionVersion: string): Promise<Result<string, ProblemDetail>> {
        return this.request({
            method: 'post',
            path: '/sample/details',
            data: { [this.schema.primaryKey]: accessionVersion, dataFormat: 'TSV' },
            responseSchema: z.string(),
        });
    }

    public async getLatestAccessionVersion(accession: string): Promise<Result<AccessionVersion, ProblemDetail>> {
        const result = await this.getDetails({
            accession,
            versionStatus: versionStatuses.latestVersion,
            fields: [ACCESSION_FIELD, VERSION_FIELD],
        });

        return result.andThen(({ data }) => {
            if (data.length !== 1) {
                return err({
                    type: 'about:blank',
                    title: 'Unexpected number of results',
                    detail: `Expected 1 result, got ${data.length}`,
                    status: 500,
                    instance: 'LapisClient/getLatestAccessionVersion',
                });
            }
            const parsedAccessionversion = accessionVersion.safeParse(data[0]);
            if (!parsedAccessionversion.success) {
                return err({
                    type: 'about:blank',
                    title: 'Could not parse accession version',
                    detail: `Expected 1 result, got ${data.length}`,
                    status: 500,
                    instance: 'LapisClient/getLatestAccessionVersion',
                });
            }
            return ok(parsedAccessionversion.data);
        });
    }

    public async getAllSequenceEntryHistoryForAccession(
        accession: string,
    ): Promise<Result<SequenceEntryHistory, ProblemDetail>> {
        const result = await this.getDetails({
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
        });
        const createSequenceHistoryProblemDetail = (detail: string): ProblemDetail => ({
            type: 'about:blank',
            title: 'Could not get sequence entry history',
            status: 500,
            instance: 'LapisClient/getAllSequenceEntryHistoryForAccession',
            detail,
        });

        return result.andThen(({ data }) => {
            const parseResult = sequenceEntryHistory.safeParse(data);
            return parseResult.success
                ? ok(parseResult.data)
                : err(
                      createSequenceHistoryProblemDetail(
                          `Validation error for ${accession}: ${parseResult.error.toString()}`,
                      ),
                  );
        });
    }

    public getSequenceMutations(accessionVersion: string, type: BaseType) {
        return this.request({
            method: 'post',
            path: type === 'nucleotide' ? '/sample/nucleotideMutations' : '/sample/aminoAcidMutations',
            data: { [this.schema.primaryKey]: accessionVersion },
            responseSchema: mutationsResponse,
        });
    }

    public getSequenceInsertions(accessionVersion: string, type: BaseType) {
        return this.request({
            method: 'post',
            path: type === 'nucleotide' ? '/sample/nucleotideInsertions' : '/sample/aminoAcidInsertions',
            data: {
                [this.schema.primaryKey]: accessionVersion,
                orderBy: [
                    { field: 'sequenceName', type: 'ascending' },
                    { field: 'position', type: 'ascending' },
                ],
            } satisfies LapisRequest,
            responseSchema: insertionsResponse,
        });
    }

    public getUnalignedSequences(accessionVersion: string, options: { fastaHeaderTemplate?: string } = {}) {
        return this.request({
            method: 'post',
            path: '/sample/unalignedNucleotideSequences',
            data: { [this.schema.primaryKey]: accessionVersion, dataFormat: 'FASTA', ...options },
            responseSchema: z.string(),
        });
    }

    public async getUnalignedSequencesMultiSegment(accessionVersion: string, segmentNames: string[]) {
        const results = await Promise.all(
            segmentNames.map((segment) =>
                this.request({
                    method: 'post',
                    path: apiPath`/sample/unalignedNucleotideSequences/${segment}`,
                    data: { [this.schema.primaryKey]: accessionVersion, dataFormat: 'FASTA' },
                    responseSchema: z.string(),
                }),
            ),
        );
        return Result.combine(results);
    }

    public getSequenceFasta(
        accessionVersion: string,
        options: { fastaHeaderTemplate?: string } = {},
    ): Promise<Result<string, ProblemDetail>> {
        return this.getUnalignedSequences(accessionVersion, options);
    }

    public async getMultiSegmentSequenceFasta(
        accessionVersion: string,
        segmentNames: string[],
        referenceNameMap?: Record<string, string>,
    ): Promise<Result<string, ProblemDetail>> {
        const segments = await this.getUnalignedSequencesMultiSegment(accessionVersion, segmentNames);
        return segments.map((segmentFastas) =>
            segmentFastas
                .map((fasta, i) => {
                    const parsed = parseFasta(fasta);
                    if (parsed.length === 0) {
                        return '';
                    }
                    const withSegmentSuffix = {
                        name: `${parsed[0].name}_${referenceNameMap?.[segmentNames[i]] ?? segmentNames[i]}`,
                        sequence: parsed[0].sequence,
                    };
                    return fastaEntryToString([withSegmentSuffix]);
                })
                .join(''),
        );
    }

    public streamSequences(
        segment: string | undefined,
        request: {
            [key: string]: string | number | null | string[] | undefined;
            dataFormat?: 'fasta' | 'json' | 'ndjson';
        },
    ) {
        const path =
            segment === undefined
                ? '/sample/unalignedNucleotideSequences'
                : apiPath`/sample/unalignedNucleotideSequences/${segment}`;
        return axios.post<Readable>(`${this.baseUrl}${path}`, request, { responseType: 'stream' });
    }
}
