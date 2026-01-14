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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            (axiosError) => axiosError.data,
            logger,
            'backend',
        );
    }

    public getGroupsOfUser(token: string | undefined) {
        return this.call('getGroupsOfUser', {
            headers: createAuthorizationHeader(token),
        });
    }

    public getGroupDetails(groupId: number, token?: string) {
        return this.call('getGroupDetails', {
            headers: createAuthorizationHeader(token),
            params: { groupId },
        });
    }

    public createGroup(token: string, data: NewGroup) {
        return this.call('createGroup', data, { headers: createAuthorizationHeader(token) });
    }
}
