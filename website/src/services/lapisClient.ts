import type { Narrow } from '@zodios/core/lib/utils.types';

import { lapisApi } from './lapisApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getConfig, getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import type { BaseType, Config } from '../types.ts';

export class LapisClient extends ZodiosWrapperClient<typeof lapisApi> {
    constructor(
        backendUrl: string,
        api: Narrow<typeof lapisApi>,
        logger: InstanceLogger,
        private readonly config: Config,
    ) {
        super(
            backendUrl,
            api,
            (axiosError) => (typeof axiosError.data?.error === 'object' ? axiosError.data.error : axiosError.data),
            logger,
            'LAPIS',
        );
    }

    public static create(lapisUrl: string = getRuntimeConfig().forServer.lapisUrl, config: Config = getConfig()) {
        return new LapisClient(lapisUrl, lapisApi, getInstanceLogger('lapisClient'), config);
    }

    public getSequenceDetails(primaryKey: string) {
        return this.call('details', {
            [this.config.schema.primaryKey]: primaryKey,
        });
    }

    public getSequenceMutations(primaryKey: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? 'nucleotideMutations' : 'aminoAcidMutations';
        return this.call(endpoint, {
            [this.config.schema.primaryKey]: primaryKey,
        });
    }

    public getSequenceInsertions(primaryKey: string, type: BaseType) {
        const endpoint = type === 'nucleotide' ? 'nucleotideInsertions' : 'aminoAcidInsertions';
        return this.call(endpoint, {
            [this.config.schema.primaryKey]: primaryKey,
        });
    }
}
