import { groupManagementApi } from './groupManagementApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

export class GroupManagementClient extends ZodiosWrapperClient<typeof groupManagementApi> {
    public static create(
        backendUrl: string = getRuntimeConfig().serverSide.backendUrl,
        logger = getInstanceLogger('serverSideBackendClient'),
    ) {
        return new GroupManagementClient(
            backendUrl,
            groupManagementApi,
            (axiosError) => axiosError.data,
            logger,
            'backend',
        );
    }
}
