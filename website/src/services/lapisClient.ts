import type { Narrow } from '@zodios/core/lib/utils.types';

import { lapisApi } from './lapisApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getConfig, getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import type { Schema } from '../types/config.ts';
import type { BaseType } from '../utils/sequenceTypeHelpers.ts';

export class LapisClient extends ZodiosWrapperClient<typeof lapisApi> {
    constructor(
        backendUrl: string,
        api: Narrow<typeof lapisApi>,
        logger: InstanceLogger,
        private readonly schema: Schema,
    ) {
        super(
            backendUrl,
            api,
            (axiosError) => (typeof axiosError.data?.error === 'object' ? axiosError.data.error : axiosError.data),
            logger,
            'LAPIS',
        );
    }

    public static create(
        lapisUrl: string = getRuntimeConfig().forServer.lapisUrl,
        schema: Schema = getConfig(),
        logger: InstanceLogger = getInstanceLogger('lapisClient'),
    ) {
        return new LapisClient(lapisUrl, lapisApi, logger, schema);
    }

    public getSequenceDetails(primaryKey: string) {
        return this.call('details', {
            [this.schema.primaryKey]: primaryKey,
        });
    }

    public getSequenceMutations(primaryKey: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? 'nucleotideMutations' : 'aminoAcidMutations';
        return this.call(endpoint, {
            [this.schema.primaryKey]: primaryKey,
        });
    }

    public getSequenceInsertions(primaryKey: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? 'nucleotideInsertions' : 'aminoAcidInsertions';
        return this.call(endpoint, {
            [this.schema.primaryKey]: primaryKey,
        });
    }
}
