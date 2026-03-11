import type { Readable } from 'stream';

import axios from 'axios';
import { err, ok, Result } from 'neverthrow';
import z from 'zod';

import { ApiClient } from './zodiosWrapperClient.ts';
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
    mutationsResponse,
    sequenceEntryHistory,
    type SequenceEntryHistory,
    versionStatuses,
} from '../types/lapis.ts';
import { fastaEntryToString, parseFasta } from '../utils/parseFasta.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

// Schema for string responses (FASTA, etc.) - no validation needed, just pass through
const stringSchema = z.any().transform(String);

export class LapisClient extends ApiClient {
    constructor(
        url: string,
        logger: InstanceLogger,
        private readonly schema: Schema,
    ) {
        super(
            url,
            (data: unknown) => {
                const obj = data as Record<string, unknown> | undefined;
                return typeof obj?.error === 'object'
                    ? (obj.error as ProblemDetail | undefined)
                    : (data as ProblemDetail | undefined);
            },
            logger,
            'LAPIS',
        );
    }

    public static createForOrganism(organism: string) {
        return this.create(getLapisUrl(getRuntimeConfig().serverSide, organism), getSchema(organism));
    }

    public static create(lapisUrl: string, schema: Schema, logger: InstanceLogger = getInstanceLogger('lapisClient')) {
        return new LapisClient(lapisUrl, logger, schema);
    }

    public getSequenceEntryVersionDetails(accessionVersion: string) {
        return this.request('post', '/sample/details', detailsResponse, {
            data: { [this.schema.primaryKey]: accessionVersion },
        });
    }

    public getSequenceEntryVersionDetailsTsv(accessionVersion: string): Promise<Result<string, ProblemDetail>> {
        return this.request('post', '/sample/details', stringSchema, {
            data: {
                [this.schema.primaryKey]: accessionVersion,
                dataFormat: 'TSV',
            },
        });
    }

    public async getLatestAccessionVersion(accession: string): Promise<Result<AccessionVersion, ProblemDetail>> {
        const result = await this.request('post', '/sample/details', detailsResponse, {
            data: {
                accession,
                versionStatus: versionStatuses.latestVersion,
                fields: [ACCESSION_FIELD, VERSION_FIELD],
            },
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
        const requestData = {
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
        };
        const result = await this.request('post', '/sample/details', detailsResponse, {
            data: requestData,
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
        const endpoint = type === 'nucleotide' ? '/sample/nucleotideMutations' : '/sample/aminoAcidMutations';
        return this.request('post', endpoint, mutationsResponse, {
            data: { [this.schema.primaryKey]: accessionVersion },
        });
    }

    public getSequenceInsertions(accessionVersion: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? '/sample/nucleotideInsertions' : '/sample/aminoAcidInsertions';
        const requestData = {
            [this.schema.primaryKey]: accessionVersion,
            orderBy: [
                { field: 'sequenceName', type: 'ascending' },
                { field: 'position', type: 'ascending' },
            ],
        };
        return this.request('post', endpoint, insertionsResponse, {
            data: requestData,
        });
    }

    public getUnalignedSequences(accessionVersion: string, options: { fastaHeaderTemplate?: string } = {}) {
        return this.request('post', '/sample/unalignedNucleotideSequences', stringSchema, {
            data: {
                [this.schema.primaryKey]: accessionVersion,
                dataFormat: 'FASTA',
                ...options,
            },
        });
    }

    public async getUnalignedSequencesMultiSegment(accessionVersion: string, segmentNames: string[]) {
        const results = await Promise.all(
            segmentNames.map((segment) =>
                this.request('post', `/sample/unalignedNucleotideSequences/${segment}`, stringSchema, {
                    data: {
                        [this.schema.primaryKey]: accessionVersion,
                        dataFormat: 'FASTA',
                    },
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
        const baseUrl = `${this.baseUrl}/sample/unalignedNucleotideSequences`;
        const url = segment === undefined ? baseUrl : `${baseUrl}/${segment}`;
        return axios.post<Readable>(url, request, { responseType: 'stream' });
    }

    public getAggregated(request: Record<string, unknown>): Promise<Result<AggregatedResponse, ProblemDetail>> {
        return this.request('post', '/sample/aggregated', aggregatedResponse, {
            data: request,
        });
    }

    public async getDetails(request: Record<string, unknown>): Promise<Result<DetailsResponse, ProblemDetail>> {
        return this.request('post', '/sample/details', detailsResponse, {
            data: { ...request, dataFormat: 'json' },
        });
    }
}
