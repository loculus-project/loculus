import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import { authorizationHeader, conflictError, notAuthorizedError } from './commonApiTypes.ts';
import { group, groupDetails } from '../types/backend.ts';

const createGroupEndpoint = makeEndpoint({
    method: 'post',
    path: '/groups',
    alias: 'createGroup',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: z.object({
                groupName: z.string(),
            }),
        },
    ],
    response: z.never(),
    errors: [notAuthorizedError, conflictError],
});
const addUserToGroupEndpoint = makeEndpoint({
    method: 'put',
    path: '/groups/:groupName/users/:userToAdd',
    alias: 'addUserToGroup',
    parameters: [authorizationHeader],
    response: z.never(),
    errors: [notAuthorizedError, conflictError],
});
const removeUserFromGroupEndpoint = makeEndpoint({
    method: 'delete',
    path: '/groups/:groupName/users/:userToRemove',
    alias: 'removeUserFromGroup',
    parameters: [authorizationHeader],
    response: z.never(),
    errors: [notAuthorizedError],
});
const getUsersOfGroupEndpoint = makeEndpoint({
    method: 'get',
    path: '/groups/:detailsOfGroupName',
    alias: 'getUsersOfGroup',
    parameters: [authorizationHeader],
    response: groupDetails,
    errors: [notAuthorizedError],
});
const getGroupsOfUserEndpoint = makeEndpoint({
    method: 'get',
    path: '/user/groups',
    alias: 'getGroupsOfUser',
    parameters: [authorizationHeader],
    response: z.array(group),
    errors: [notAuthorizedError],
});
const getAllGroupsEndpoint = makeEndpoint({
    method: 'get',
    path: '/groups',
    alias: 'getAllGroups',
    parameters: [authorizationHeader],
    response: z.array(group),
    errors: [notAuthorizedError],
});
export const groupManagementApi = makeApi([
    createGroupEndpoint,
    addUserToGroupEndpoint,
    removeUserFromGroupEndpoint,
    getUsersOfGroupEndpoint,
    getGroupsOfUserEndpoint,
    getAllGroupsEndpoint,
]);
