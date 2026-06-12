// Note: this is the website's client for the Loculus query-service v1 API.
// It is still called LapisClient for now to keep the diff small.

import type { Readable } from 'stream';

import type { Narrow } from '@zodios/core/lib/utils.types';
import axios, { type AxiosError, type Method } from 'axios';
import { err, ok, Result } from 'neverthrow';
import { ZodSchema } from 'zod';

import { lapisApi } from './lapisApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getQueryServiceUrl, getRuntimeConfig, getSchema } from '../config.ts';
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
    detailsResponse,
    type DetailsResponse,
    type LapisBaseRequest,
    sequenceEntryHistory,
    type SequenceEntryHistory,
    versionStatuses,
} from '../types/lapis.ts';
import { fastaEntryToString, parseFasta } from '../utils/parseFasta.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

export class LapisClient extends ZodiosWrapperClient<typeof lapisApi> {
    constructor(
        private readonly url: string,
        public readonly organism: string,
        api: Narrow<typeof lapisApi>,
        logger: InstanceLogger,
        private readonly schema: Schema,
    ) {
        super(
            url,
            api,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
            (axiosError) => (typeof axiosError.data?.error === 'object' ? axiosError.data?.error : axiosError.data),
            logger,
            'LAPIS',
        );
    }

    private organismQuery() {
        return { queries: { organism: this.organism } } as const;
    }

    /**
     * For queries that need to see every version & revocation (e.g. version
     * history), opt out of the query-service's implicit defaults.
     */
    private organismQueryAll() {
        return { queries: { organism: this.organism, include: 'all' } } as const;
    }

    public static createForOrganism(organism: string) {
        return this.create(getQueryServiceUrl(getRuntimeConfig().serverSide), organism, getSchema(organism));
    }

    public static create(
        queryServiceUrl: string,
        organism: string,
        schema: Schema,
        logger: InstanceLogger = getInstanceLogger('lapisClient'),
    ) {
        return new LapisClient(queryServiceUrl, organism, lapisApi, logger, schema);
    }

    public getSequenceEntryVersionDetails(accessionVersion: string) {
        return this.call(
            'details',
            {
                [this.schema.primaryKey]: accessionVersion,
            },
            this.organismQuery(),
        );
    }

    public async getSequenceEntryVersionDetailsTsv(accessionVersion: string): Promise<Result<string, ProblemDetail>> {
        const result = await this.call(
            'details',
            {
                [this.schema.primaryKey]: accessionVersion,
                dataFormat: 'TSV',
            },
            this.organismQuery(),
        );
        // This type cast isn't pretty, but if the API would be typed correctly, the union type
        // of the actual details response and the potential 'string' would pollute the whole API,
        // so I (@fhennig) decided to just do this cast here. We know that the return value is a TSV string.
        return result.map((data) => data as unknown as string);
    }

    public async getLatestAccessionVersion(accession: string): Promise<Result<AccessionVersion, ProblemDetail>> {
        const result = await this.call(
            'details',
            {
                accession,
                versionStatus: versionStatuses.latestVersion,
                fields: [ACCESSION_FIELD, VERSION_FIELD],
            },
            this.organismQuery(),
        );

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
        // @ts-expect-error Bug in Zod: https://github.com/colinhacks/zod/issues/3136
        const request: LapisBaseRequest = {
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
        // Version history needs every version (including revocations) for
        // the accession.
        const result = await this.call('details', request, this.organismQueryAll());
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
        const endpoint = type === 'nucleotide' ? 'nucleotideMutations' : 'aminoAcidMutations';
        return this.call(
            endpoint,
            {
                [this.schema.primaryKey]: accessionVersion,
            },
            this.organismQuery(),
        );
    }

    public getSequenceInsertions(accessionVersion: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? 'nucleotideInsertions' : 'aminoAcidInsertions';
        const request = {
            [this.schema.primaryKey]: accessionVersion,
            orderBy: [
                { field: 'sequenceName', type: 'ascending' },
                { field: 'position', type: 'ascending' },
            ],
        };
        return this.call(endpoint, request as LapisBaseRequest, this.organismQuery());
    }

    public getUnalignedSequences(accessionVersion: string, options: { fastaHeaderTemplate?: string } = {}) {
        return this.call(
            'unalignedNucleotideSequences',
            {
                [this.schema.primaryKey]: accessionVersion,
                dataFormat: 'FASTA',
                ...options,
            },
            this.organismQuery(),
        );
    }

    public async getUnalignedSequencesMultiSegment(accessionVersion: string, segmentNames: string[]) {
        const results = await Promise.all(
            segmentNames.map((segment) =>
                this.call(
                    'unalignedNucleotideSequences',
                    {
                        [this.schema.primaryKey]: accessionVersion,
                        dataFormat: 'FASTA',
                    },
                    { queries: { organism: this.organism, segment } },
                ),
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
        const url = `${this.url}/v1/unalignedSequences`;
        const params: Record<string, string> = { organism: this.organism };
        if (segment !== undefined) {
            params.segment = segment;
        }
        return axios.post<Readable>(url, request, {
            responseType: 'stream',
            params,
        });
    }

    public async getDetails(request: {
        [key: string]: string | number | null | string[] | undefined;
        fields?: string[];
    }): Promise<Result<DetailsResponse, ProblemDetail>> {
        return this.request('/v1/metadata', 'post', { ...request, dataFormat: 'json' }, detailsResponse);
    }

    private async request<T>(
        endpoint: string,
        method: Method,
        request: unknown,
        responseSchema: ZodSchema<T>,
    ): Promise<Result<T, ProblemDetail>> {
        try {
            const response = await axios.request({
                url: `${this.url}${endpoint}`,
                method,
                data: request,
                params: { organism: this.organism },
            });

            const responseDataResult = responseSchema.safeParse(response.data);
            if (responseDataResult.success) {
                return ok(responseDataResult.data);
            }
            return err({
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to parse query-service response: ${responseDataResult.error.toString()}`,
                instance: '/v1/metadata',
            });
        } catch (e) {
            const axiosError = e as AxiosError;

            return err(this.createProblemDetail(axiosError, endpoint));
        }
    }
}
