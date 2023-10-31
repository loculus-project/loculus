import type { Narrow } from '@zodios/core/lib/utils.types';

import { lapisApi } from './lapisApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getLapisUrl, getRuntimeConfig, getSchema } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import type { Schema } from '../types/config.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

export const siloVersionStatuses = {
    revoked: 'REVOKED',
    revised: 'REVISED',
    latestVersion: 'LATEST_VERSION',
} as const;

export type SiloVersionStatus = (typeof siloVersionStatuses)[keyof typeof siloVersionStatuses];
export function isSiloVersionStatus(status: string | undefined): status is SiloVersionStatus {
    if (status === undefined) {
        return false;
    }
    return Object.values(siloVersionStatuses).includes(status as SiloVersionStatus);
}
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

    public async getLatestAccessionVersion(accession: string) {
        const result = await this.call('details', {
            accession,
            versionStatus: siloVersionStatuses.latestVersion,
            fields: ['accessionVersion'],
        });

        if (result.isErr()) {
            throw new Error(`Failed to get latest version for ${accession}: ${JSON.stringify(result.error)}`);
        }

        // TODO(#619): Remove this once SILO is fixed
        if (result.value.data.length === 0) {
            return 'This should be the accessionVersion of the latest version, but the latest version is a revocation version that does not yet exist in SILO';
        }

        const latestVersion = result.value.data[0]?.accessionVersion?.toString();

        if (latestVersion === undefined) {
            throw new Error(`Failed to get latest version for ${accession}: ${JSON.stringify(result)}`);
        }

        return latestVersion;
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
