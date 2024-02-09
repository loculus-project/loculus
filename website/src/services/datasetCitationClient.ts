import { datasetCitationApi } from './datasetCitationApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

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
}
