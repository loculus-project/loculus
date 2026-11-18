import z from 'zod';

import type { ApiDefinition } from './apiClient.ts';
import { group, groupDetails, newGroup } from '../types/backend.ts';

export const groupManagementApi = {
    createGroup: {
        method: 'post',
        path: '/groups',
        body: newGroup,
        response: group,
    },
    editGroup: {
        method: 'put',
        path: '/groups/:groupId',
        body: newGroup,
        response: group,
    },
    addUserToGroup: {
        method: 'put',
        path: '/groups/:groupId/users/:userToAdd',
        response: z.never(),
    },
    removeUserFromGroup: {
        method: 'delete',
        path: '/groups/:groupId/users/:userToRemove',
        response: z.never(),
    },
    getGroupDetails: {
        method: 'get',
        path: '/groups/:groupId',
        response: groupDetails,
    },
    getGroupsOfUser: {
        method: 'get',
        path: '/user/groups',
        response: z.array(group),
    },
    getAllGroups: {
        method: 'get',
        path: '/groups',
        queries: z.object({
            name: z.string().optional(),
        }),
        response: z.array(group),
    },
} as const satisfies ApiDefinition;
