import z from 'zod';

import { ApiClient } from './apiClient.ts';
import { apiPath } from './apiRequest.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { group, groupDetails, type NewGroup } from '../types/backend.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const instanceLogger = getInstanceLogger('GroupManagementClient');

export class GroupManagementClient extends ApiClient {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = instanceLogger) {
        return new GroupManagementClient(backendUrl, (responseData) => responseData, logger, 'backend');
    }

    public getGroupsOfUser(token: string | undefined) {
        return this.request({
            method: 'get',
            path: '/user/groups',
            headers: createAuthorizationHeader(token),
            responseSchema: z.array(group),
        });
    }

    public getGroupDetails(groupId: number, token?: string) {
        return this.request({
            method: 'get',
            path: apiPath`/groups/${groupId}`,
            headers: createAuthorizationHeader(token),
            responseSchema: groupDetails,
        });
    }

    public createGroup(token: string, data: NewGroup) {
        return this.request({
            method: 'post',
            path: '/groups',
            data,
            headers: createAuthorizationHeader(token),
            responseSchema: group,
        });
    }
}
