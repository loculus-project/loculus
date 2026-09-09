import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useCallback } from 'react';
import z from 'zod';

import { group, groupDetails, type Group, type GroupDetails, type NewGroup } from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

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
    const backendUrl = clientConfig.backendUrl;

    const groupDetailsQuery = useQuery({
        queryKey: ['getGroupDetails', backendUrl, groupId, accessToken],
        queryFn: async () => {
            const response = await axios.get(`${backendUrl}/groups/${groupId}`, {
                headers: createAuthorizationHeader(accessToken),
            });
            return groupDetails.parse(response.data);
        },
        enabled: false,
        initialData: prefetchedGroupDetails,
    });

    if (groupDetailsQuery.error) {
        setErrorMessage(`Failed to query Group ${groupName}: ${stringifyMaybeAxiosError(groupDetailsQuery.error)}`);
    }

    const addUserToGroup = useCallback(
        async (username: string) => {
            try {
                await axios.put(`${backendUrl}/groups/${groupId}/users/${username}`, undefined, {
                    headers: createAuthorizationHeader(accessToken),
                });
                await groupDetailsQuery.refetch();
            } catch (error) {
                const message = `Failed to add user to group: ${stringifyMaybeAxiosError(error)}`;
                setErrorMessage(message);
            }
        },
        [accessToken, setErrorMessage, groupDetailsQuery.refetch, backendUrl, groupId],
    );

    const removeFromGroup = useCallback(
        async (username: string) => {
            try {
                await axios.delete(`${backendUrl}/groups/${groupId}/users/${username}`, {
                    headers: createAuthorizationHeader(accessToken),
                });
                await groupDetailsQuery.refetch();
            } catch (error) {
                const message = `Failed to leave group: ${stringifyMaybeAxiosError(error)}`;
                setErrorMessage(message);
            }
        },
        [accessToken, setErrorMessage, groupDetailsQuery.refetch, backendUrl, groupId],
    );

    return {
        addUserToGroup,
        removeFromGroup,
        groupDetails: groupDetailsQuery,
    };
};

export const useGroupCreation = ({
    clientConfig,
    accessToken,
}: {
    clientConfig: ClientConfig;
    accessToken: string;
}) => {
    const backendUrl = clientConfig.backendUrl;

    const createGroup = useCallback(
        async (newGroup: NewGroup) => callCreateGroup(accessToken, backendUrl)(newGroup),
        [accessToken, backendUrl],
    );

    return {
        createGroup,
    };
};

export const useGetGroups = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const backendUrl = clientConfig.backendUrl;

    const getGroups = useCallback(
        async (groupName?: string) => callGetGroups(accessToken, backendUrl)(groupName),
        [accessToken, backendUrl],
    );

    return {
        getGroups,
    };
};

export const useGroupEdit = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const backendUrl = clientConfig.backendUrl;

    const editGroup = useCallback(
        async (groupId: number, groupData: NewGroup) => callEditGroup(accessToken, backendUrl)(groupId, groupData),
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
            const response = await axios.post(`${backendUrl}/groups`, newGroup, {
                headers: createAuthorizationHeader(accessToken),
            });
            const groupResult = group.parse(response.data);
            return {
                succeeded: true,
                group: groupResult,
            } as CreateGroupSuccess;
        } catch (error) {
            const message = `Failed to create group: ${stringifyMaybeAxiosError(error)}`;
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
            const response = await axios.get(`${backendUrl}/groups`, {
                headers: createAuthorizationHeader(accessToken),
                params: { name: groupName },
            });
            const existingGroups = z.array(group).parse(response.data);
            return {
                succeeded: true,
                groups: existingGroups,
            } as GetGroupsSuccess;
        } catch (error) {
            const message = `Failed to query existing groups: ${stringifyMaybeAxiosError(error)}`;
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
    return async (groupId: number, groupData: NewGroup) => {
        try {
            const response = await axios.put(`${backendUrl}/groups/${groupId}`, groupData, {
                headers: createAuthorizationHeader(accessToken),
            });
            const groupResult = group.parse(response.data);
            return {
                succeeded: true,
                group: groupResult,
            } as EditGroupSuccess;
        } catch (error) {
            const message = `Failed to edit group: ${stringifyMaybeAxiosError(error)}`;
            return {
                succeeded: false,
                errorMessage: message,
            } as EditGroupError;
        }
    };
}
