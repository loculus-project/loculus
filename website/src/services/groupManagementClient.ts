import z from 'zod';

import { ApiClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { group, groupDetails, type NewGroup, type ProblemDetail } from '../types/backend.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const instanceLogger = getInstanceLogger('GroupManagementClient');

export class GroupManagementClient extends ApiClient {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = instanceLogger) {
        return new GroupManagementClient(
            backendUrl,
            (data: unknown) => data as ProblemDetail | undefined,
            logger,
            'backend',
        );
    }

    public getGroupsOfUser(token: string | undefined) {
        return this.request('get', '/user/groups', z.array(group), {
            headers: createAuthorizationHeader(token),
        });
    }

    public getGroupDetails(groupId: number, token?: string) {
        return this.request('get', `/groups/${groupId}`, groupDetails, {
            headers: createAuthorizationHeader(token),
        });
    }

    public createGroup(token: string, data: NewGroup) {
        return this.request('post', '/groups', group, {
            data,
            headers: createAuthorizationHeader(token),
        });
    }
}
