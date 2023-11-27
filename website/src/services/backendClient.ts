import { backendApi } from './backendApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

export class BackendClient extends ZodiosWrapperClient<typeof backendApi> {
    /** Somehow Typescript's type inference currently doesn't work properly in Astro files */
    public readonly astroFileTypeHelpers = {
        getSequenceEntriesOfUser: (organism: string, username: string) =>
            this.call('getSequencesOfUser', {
                params: { organism },
                queries: { username },
            }),

        getDataToReview: (organism: string, username: string, accession: string, version: string | number) =>
            this.call('getDataToReview', {
                params: { accession, version, organism },
                queries: { username },
            }),
    };

    public static create(
        backendUrl: string = getRuntimeConfig().serverSide.backendUrl,
        logger = getInstanceLogger('serverSideBackendClient'),
    ) {
        return new BackendClient(backendUrl, backendApi, (axiosError) => axiosError.data, logger, 'backend');
    }
}
