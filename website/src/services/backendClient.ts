import { backendApi } from './backendApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

export class BackendClient extends ZodiosWrapperClient<typeof backendApi> {
    /** Somehow Typescript's type inference currently doesn't work properly in Astro files */
    public readonly astroFileTypeHelpers = {
        getSequencesOfUser: (username: string) =>
            this.call('getSequencesOfUser', {
                queries: { username },
            }),

        getDataToReview: (username: string, sequenceId: string | number, version: string | number) =>
            this.call('getDataToReview', {
                params: { sequenceId, version },
                queries: { username },
            }),
    };

    public static create(
        backendUrl: string = getRuntimeConfig().forServer.backendUrl,
        logger: ReturnType<typeof getInstanceLogger> = getInstanceLogger('serverSideBackendClient'),
    ) {
        return new BackendClient(backendUrl, backendApi, (axiosError) => axiosError.data, logger, 'backend');
    }
}
