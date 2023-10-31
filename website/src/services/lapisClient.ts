import type { Narrow } from '@zodios/core/lib/utils.types';
import { err, ok, Result } from 'neverthrow';
import { z } from 'zod';

import { lapisApi } from './lapisApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getLapisUrl, getRuntimeConfig, getSchema } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import { accessionVersion, type AccessionVersion, type ProblemDetail } from '../types/backend.ts';
import type { Schema } from '../types/config.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

export const siloVersionStatuses = {
    revoked: 'REVOKED',
    revised: 'REVISED',
    latestVersion: 'LATEST_VERSION',
} as const;

export type SiloVersionStatus = (typeof siloVersionStatuses)[keyof typeof siloVersionStatuses];
export function isSiloVersionStatus(status: string | undefined | null): status is SiloVersionStatus {
    if (status === undefined || status === null) {
        return false;
    }
    return Object.values(siloVersionStatuses).includes(status as SiloVersionStatus);
}

export type SequenceEntryHistory = SequenceEntryHistoryEntry[];

const sequenceEntryHistoryEntry = accessionVersion.merge(
    z.object({
        versionStatus: z.string().refine((status) => isSiloVersionStatus(status), {
            message: `Invalid version status`,
        }) as z.ZodType<SiloVersionStatus>,
    }),
);

type SequenceEntryHistoryEntry = z.infer<typeof sequenceEntryHistoryEntry>;

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
            // why?
            [this.schema.primaryKey]: accessionVersion,
        });
    }

    public async getLatestAccessionVersion(accession: string): Promise<Result<AccessionVersion, ProblemDetail>> {
        const result = await this.call('details', {
            accession,
            versionStatus: siloVersionStatuses.latestVersion,
            fields: ['accession', 'version'],
        });

        if (result.isOk()) {
            const data = result.value.data;
            if (data.length !== 1) {
                const problemDetail: ProblemDetail = {
                    type: 'about:blank',
                    title: 'Unexpected number of results',
                    detail: `Expected 1 result, got ${data.length}`,
                    status: 500,
                    instance: 'LapisClient/getLatestAccessionVersion',
                };
                return err(problemDetail);
            }
            const parsedAccessionversion = accessionVersion.safeParse(data[0]);
            if (!parsedAccessionversion.success) {
                const problemDetail: ProblemDetail = {
                    type: 'about:blank',
                    title: 'Could not parse accession version',
                    detail: `Expected 1 result, got ${data.length}`,
                    status: 500,
                    instance: 'LapisClient/getLatestAccessionVersion',
                };
                return err(problemDetail);
            }
            return ok(parsedAccessionversion.data);
        }
        return result;
    }

    public async getAllSequenceEntryHistoryForAccession(
        accession: string,
    ): Promise<Result<SequenceEntryHistory, ProblemDetail>> {
        const result = await this.call('details', {
            accession,
            fields: ['accession', 'version', 'versionStatus'],
            orderBy: ['version'],
        });

        const createSequenceHistoryProblemDetail = (detail: string): ProblemDetail => ({
            type: 'about:blank',
            title: 'Could not get sequence entry history',
            status: 500,
            instance: 'LapisClient/getAllSequenceEntryHistoryForAccession',
            detail,
        });

        return result.match(
            (data) =>
                Result.combine(
                    data.data.map((entry) => {
                        const parsedHistory = sequenceEntryHistoryEntry.safeParse(entry);
                        return parsedHistory.success
                            ? ok(parsedHistory.data)
                            : err(
                                  createSequenceHistoryProblemDetail(
                                      `Validation error for ${accession}: ${parsedHistory.error.errors}`,
                                  ),
                              );
                    }),
                ),
            (error) => err(error),
        );
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
}
