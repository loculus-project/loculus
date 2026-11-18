import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import z from 'zod';

import { apiPath, getErrorMessage, sendRequest } from '../services/apiRequest.ts';
import {
    group,
    groupDetails as groupDetailsSchema,
    type Group,
    type GroupDetails,
    type NewGroup,
} from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

type UseGroupOperationsProps = {
    clientConfig: ClientConfig;
    accessToken: string | undefined;
    setErrorMessage: (message?: string) => void;
};

export const useGroupPageHooks = ({
    clientConfig,
    accessToken,
    setErrorMessage,
    prefetchedGroupDetails,
}: UseGroupOperationsProps & { prefetchedGroupDetails: GroupDetails }) => {
    const groupName = prefetchedGroupDetails.group.groupName;
    const groupId = prefetchedGroupDetails.group.groupId;
    const { backendUrl } = clientConfig;

    const groupDetails = useQuery<GroupDetails, Error>({
        queryKey: ['getGroupDetails', backendUrl, groupId, accessToken],
        queryFn: ({ signal }) =>
            sendRequest(backendUrl, {
                method: 'get',
                path: apiPath`/groups/${groupId}`,
                headers: createAuthorizationHeader(accessToken),
                signal,
                responseSchema: groupDetailsSchema,
            }),
        enabled: false,
        initialData: prefetchedGroupDetails,
    });

    if (groupDetails.error) {
        setErrorMessage(`Failed to query Group ${groupName}: ${getErrorMessage(groupDetails.error)}`);
    }

    const addUserToGroup = useCallback(
        async (username: string) => {
            await callAddToGroup(accessToken, setErrorMessage, backendUrl, groupDetails.refetch)(groupId, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, backendUrl, groupId],
    );

    const removeFromGroup = useCallback(
        async (username: string) => {
            await callRemoveFromGroup(
                accessToken,
                setErrorMessage,
                backendUrl,
                groupDetails.refetch,
            )(groupId, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, backendUrl, groupId],
    );

    return {
        addUserToGroup,
        removeFromGroup,
        groupDetails,
    };
};

export const useGroupCreation = ({
    clientConfig,
    accessToken,
}: {
    clientConfig: ClientConfig;
    accessToken: string;
}) => {
    const { backendUrl } = clientConfig;

    const createGroup = useCallback(
        async (group: NewGroup) => callCreateGroup(accessToken, backendUrl)(group),
        [accessToken, backendUrl],
    );

    return {
        createGroup,
    };
};

export const useGetGroups = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const { backendUrl } = clientConfig;

    const getGroups = useCallback(
        async (groupName?: string) => callGetGroups(accessToken, backendUrl)(groupName),
        [accessToken, backendUrl],
    );

    return {
        getGroups,
    };
};

export const useGroupEdit = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const { backendUrl } = clientConfig;

    const editGroup = useCallback(
        async (groupId: number, group: NewGroup) => callEditGroup(accessToken, backendUrl)(groupId, group),
        [accessToken, backendUrl],
    );

    return {
        editGroup,
    };
};

type CreateGroupSuccess = {
    succeeded: true;
    group: Group;
};
type CreateGroupError = {
    succeeded: false;
    errorMessage: string;
};
export type CreateGroupResult = CreateGroupSuccess | CreateGroupError;

function callCreateGroup(accessToken: string, backendUrl: string) {
    return async (newGroup: NewGroup) => {
        try {
            const groupResult = await sendRequest(backendUrl, {
                method: 'post',
                path: '/groups',
                data: newGroup,
                headers: createAuthorizationHeader(accessToken),
                responseSchema: group,
            });
            return {
                succeeded: true,
                group: groupResult,
            } as CreateGroupSuccess;
        } catch (error) {
            const message = `Failed to create group: ${getErrorMessage(error)}`;
            return {
                succeeded: false,
                errorMessage: message,
            } as CreateGroupError;
        }
    };
}

type GetGroupsSuccess = {
    succeeded: true;
    groups: Group[];
};
type GetGroupsError = {
    succeeded: false;
    errorMessage: string;
};
export type GetGroupsResult = GetGroupsSuccess | GetGroupsError;

function callGetGroups(accessToken: string, backendUrl: string) {
    return async (groupName?: string) => {
        try {
            const existingGroups = await sendRequest(backendUrl, {
                method: 'get',
                path: '/groups',
                params: { name: groupName },
                headers: createAuthorizationHeader(accessToken),
                responseSchema: z.array(group),
            });
            return {
                succeeded: true,
                groups: existingGroups,
            } as GetGroupsSuccess;
        } catch (error) {
            const message = `Failed to query existing groups: ${getErrorMessage(error)}`;
            return {
                succeeded: false,
                errorMessage: message,
            } as GetGroupsError;
        }
    };
}

type EditGroupSuccess = {
    succeeded: true;
    group: Group;
};
type EditGroupError = {
    succeeded: false;
    errorMessage: string;
};
export type EditGroupResult = EditGroupSuccess | EditGroupError;

function callEditGroup(accessToken: string, backendUrl: string) {
    return async (groupId: number, newGroup: NewGroup) => {
        try {
            const groupResult = await sendRequest(backendUrl, {
                method: 'put',
                path: apiPath`/groups/${groupId}`,
                data: newGroup,
                headers: createAuthorizationHeader(accessToken),
                responseSchema: group,
            });
            return {
                succeeded: true,
                group: groupResult,
            } as EditGroupSuccess;
        } catch (error) {
            const message = `Failed to edit group: ${getErrorMessage(error)}`;
            return {
                succeeded: false,
                errorMessage: message,
            } as EditGroupError;
        }
    };
}

function callRemoveFromGroup(
    accessToken: string | undefined,
    openErrorFeedback: (message: string | undefined) => void,
    backendUrl: string,
    refetchGroups: () => Promise<unknown>,
) {
    return async (groupId: number, username: string) => {
        try {
            await sendRequest(backendUrl, {
                method: 'delete',
                path: apiPath`/groups/${groupId}/users/${username}`,
                headers: createAuthorizationHeader(accessToken),
            });
            await refetchGroups();
        } catch (error) {
            const message = `Failed to leave group: ${getErrorMessage(error)}`;
            openErrorFeedback(message);
        }
    };
}

function callAddToGroup(
    accessToken: string | undefined,
    openErrorFeedback: (message: string | undefined) => void,
    backendUrl: string,
    refetchGroups: () => Promise<unknown>,
) {
    return async (groupId: number, username: string) => {
        try {
            await sendRequest(backendUrl, {
                method: 'put',
                path: apiPath`/groups/${groupId}/users/${username}`,
                headers: createAuthorizationHeader(accessToken),
            });
            await refetchGroups();
        } catch (error) {
            const message = `Failed to add user to group: ${getErrorMessage(error)}`;
            openErrorFeedback(message);
        }
    };
}
