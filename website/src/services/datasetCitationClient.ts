import { datasetCitationApi } from './datasetCitationApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

export class DatasetCitationClient extends ZodiosWrapperClient<typeof datasetCitationApi> {
    public static create(
        backendUrl: string = getRuntimeConfig().serverSide.backendUrl,
        logger = getInstanceLogger('serverSideBackendClient'),
    ) {
        return new DatasetCitationClient(
            backendUrl,
            datasetCitationApi,
            (axiosError) => axiosError.data,
            logger,
            'backend',
        );
    }

    public getDatasetsOfUser(accessToken: string) {
        return this.call('getDatasetsOfUser', {
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getUserCitedBy(username: string, accessToken: string) {
        return this.call('getUserCitedBy', {
            params: { username },
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getAuthor(accessToken: string) {
        return this.call('getAuthor', {
            headers: createAuthorizationHeader(accessToken),
        });
    }
}
