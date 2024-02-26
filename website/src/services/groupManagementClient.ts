import { groupManagementApi } from './groupManagementApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

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

    public getGroupsOfUser(token: string) {
        return this.call('getGroupsOfUser', {
            headers: createAuthorizationHeader(token),
        });
    }

    public getGroupDetails(token: string, groupName: string) {
        return this.call('getGroupDetails', {
            headers: createAuthorizationHeader(token),
            params: { groupName },
        });
    }
}
