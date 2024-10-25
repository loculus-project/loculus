import type { Narrow } from '@zodios/core/lib/utils.types';
import { err, ok, Result } from 'neverthrow';

import { lapisApi } from './lapisApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
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
    type LapisBaseRequest,
    sequenceEntryHistory,
    type SequenceEntryHistory,
    versionStatuses,
} from '../types/lapis.ts';
import { fastaEntryToString, parseFasta } from '../utils/parseFasta.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

export class LapisClient extends ZodiosWrapperClient<typeof lapisApi> {
    constructor(
        url: string,
        api: Narrow<typeof lapisApi>,
        logger: InstanceLogger,
        private readonly schema: Schema,
    ) {
        super(
            url,
            api,
            (axiosError) => (typeof axiosError.data?.error === 'object' ? axiosError.data.error : axiosError.data),
            logger,
            'LAPIS',
        );
    }

    public static createForOrganism(organism: string) {
        return this.create(getLapisUrl(getRuntimeConfig().serverSide, organism), getSchema(organism));
    }

    public static create(lapisUrl: string, schema: Schema, logger: InstanceLogger = getInstanceLogger('lapisClient')) {
        return new LapisClient(lapisUrl, lapisApi, logger, schema);
    }

    public getSequenceEntryVersionDetails(accessionVersion: string) {
        return this.call('details', {
            [this.schema.primaryKey]: accessionVersion,
        });
    }

    public async getSequenceEntryVersionDetailsTsv(accessionVersion: string): Promise<Result<string, ProblemDetail>> {
        const result = await this.call('details', {
            [this.schema.primaryKey]: accessionVersion,
            dataFormat: 'TSV',
        });
        // This type cast isn't pretty, but if the API would be typed correctly, the union type
        // of the actual details resonse and the potential 'string' would pollute the whole API,
        // so I (@fhennig) decided to just do this cast here. We know that the return value is a TSV string.
        return result.map((data) => data as unknown as string);
    }

    public async getLatestAccessionVersion(accession: string): Promise<Result<AccessionVersion, ProblemDetail>> {
        const result = await this.call('details', {
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
        const result = await this.call('details', request);
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
        return this.call(endpoint, {
            [this.schema.primaryKey]: accessionVersion,
        });
    }

    public getSequenceInsertions(accessionVersion: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? 'nucleotideInsertions' : 'aminoAcidInsertions';
        return this.call(endpoint, {
            [this.schema.primaryKey]: accessionVersion,
        });
    }

    public getUnalignedSequences(accessionVersion: string) {
        return this.call('unalignedNucleotideSequences', {
            [this.schema.primaryKey]: accessionVersion,
            dataFormat: 'FASTA',
        });
    }

    public async getUnalignedSequencesMultiSegment(accessionVersion: string, segmentNames: string[]) {
        const results = await Promise.all(
            segmentNames.map((segment) =>
                this.call(
                    'unalignedNucleotideSequencesMultiSegment',
                    {
                        [this.schema.primaryKey]: accessionVersion,
                        dataFormat: 'FASTA',
                    },
                    { params: { segment } },
                ),
            ),
        );
        return Result.combine(results);
    }

    public getSequenceFasta(accessionVersion: string): Promise<Result<string, ProblemDetail>> {
        return this.getUnalignedSequences(accessionVersion);
    }

    public async getMultiSegmentSequenceFasta(
        accessionVersion: string,
        segmentNames: string[],
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
                        name: `${parsed[0].name}_${segmentNames[i]}`,
                        sequence: parsed[0].sequence,
                    };
                    return fastaEntryToString([withSegmentSuffix]);
                })
                .join(''),
        );
    }
}
