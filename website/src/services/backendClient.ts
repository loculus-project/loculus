import { backendApi } from './backendApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

export class BackendClient extends ZodiosWrapperClient<typeof backendApi> {
    /** Somehow Typescript's type inference currently doesn't work properly in Astro files */
    public readonly astroFileTypeHelpers = {
        getSequenceEntriesOfUser: (organism: string, token: string) =>
            this.call('getSequencesOfUser', {
                params: { organism },
                headers: createAuthorizationHeader(token),
            }),

        getDataToEdit: (organism: string, token: string, accession: string, version: string | number) =>
            this.call('getDataToEdit', {
                params: { accession, version, organism },
                headers: createAuthorizationHeader(token),
            }),

        getUserCitedBy: (token: string, username: string) =>
            this.call('getUserCitedBy', {
                params: { username },
                headers: createAuthorizationHeader(token),
            }),

        getDatasetCitedBy: (token: string, datasetId: string, version: string) =>
            this.call('getDatasetCitedBy', {
                params: { datasetId, version },
                headers: createAuthorizationHeader(token),
            }),

        getDatasetsOfUser: (token: string) =>
            this.call('getDatasetsOfUser', {
                headers: createAuthorizationHeader(token),
            }),

        getDataset: (token: string, datasetId: string, version: string) =>
            this.call('getDataset', {
                params: { datasetId, version },
                headers: createAuthorizationHeader(token),
            }),
        getDatasetRecords: (token: string, datasetId: string, version: string) =>
            this.call('getDatasetRecords', {
                params: { datasetId, version },
                headers: createAuthorizationHeader(token),
            }),
    };

    public static create(
        backendUrl: string = getRuntimeConfig().serverSide.backendUrl,
        logger = getInstanceLogger('serverSideBackendClient'),
    ) {
        return new BackendClient(backendUrl, backendApi, (axiosError) => axiosError.data, logger, 'backend');
    }
}
