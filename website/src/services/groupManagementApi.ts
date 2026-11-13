import { makeApi, makeEndpoint } from '@zodios/core';
import z from 'zod';

import {
    authorizationHeader,
    conflictError,
    notAuthorizedError,
    optionalAuthorizationHeader,
} from './commonApiTypes.ts';
import { group, groupDetails, newGroup } from '../types/backend.ts';
const createGroupEndpoint = makeEndpoint({
    method: 'post',
    path: '/groups',
    alias: 'createGroup',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: newGroup,
        },
    ],
    response: group,
    errors: [notAuthorizedError, conflictError],
});
const editGroupEndpoint = makeEndpoint({
    method: 'put',
    path: '/groups/:groupId',
    alias: 'editGroup',
    parameters: [
        authorizationHeader,
        {
            name: 'data',
            type: 'Body',
            schema: newGroup,
        },
    ],
    response: group,
    errors: [notAuthorizedError],
});
const addUserToGroupEndpoint = makeEndpoint({
    method: 'put',
    path: '/groups/:groupId/users/:userToAdd',
    alias: 'addUserToGroup',
    parameters: [authorizationHeader],
    response: z.never(),
    errors: [notAuthorizedError, conflictError],
});
const removeUserFromGroupEndpoint = makeEndpoint({
    method: 'delete',
    path: '/groups/:groupId/users/:userToRemove',
    alias: 'removeUserFromGroup',
    parameters: [authorizationHeader],
    response: z.never(),
    errors: [notAuthorizedError],
});
const getGroupDetailsEndpoint = makeEndpoint({
    method: 'get',
    path: '/groups/:groupId',
    alias: 'getGroupDetails',
    parameters: [optionalAuthorizationHeader],
    response: groupDetails,
});
const getGroupsOfUserEndpoint = makeEndpoint({
    method: 'get',
    path: '/user/groups',
    alias: 'getGroupsOfUser',
    parameters: [authorizationHeader],
    response: z.array(group),
    errors: [notAuthorizedError],
});
const getGroupsEndpoint = makeEndpoint({
    method: 'get',
    path: '/groups',
    alias: 'getAllGroups',
    parameters: [
        authorizationHeader,
        {
            name: 'name',
            type: 'Query',
            schema: z.string().optional(),
        },
    ],
    response: z.array(group),
    errors: [notAuthorizedError],
});
export const groupManagementApi = makeApi([
    createGroupEndpoint,
    editGroupEndpoint,
    addUserToGroupEndpoint,
    removeUserFromGroupEndpoint,
    getGroupDetailsEndpoint,
    getGroupsOfUserEndpoint,
    getGroupsEndpoint,
]);
