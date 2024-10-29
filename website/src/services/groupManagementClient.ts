import { groupManagementApi } from './groupManagementApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import type { NewGroup } from '../types/backend.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const instanceLogger = getInstanceLogger('GroupManagementClient');

export class GroupManagementClient extends ZodiosWrapperClient<typeof groupManagementApi> {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = instanceLogger) {
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

    public getGroupDetails(token: string, groupId: number) {
        return this.call('getGroupDetails', {
            headers: createAuthorizationHeader(token),
            params: { groupId },
        });
    }

    public createGroup(token: string, data: NewGroup) {
        return this.call('createGroup', data, { headers: createAuthorizationHeader(token) });
    }
}
