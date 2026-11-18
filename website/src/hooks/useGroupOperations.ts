import { useCallback, useMemo } from 'react';

import { ApiClient } from '../services/apiClient.ts';
import { makeQueryHook } from '../services/apiHooks.ts';
import { groupManagementApi } from '../services/groupManagementApi.ts';
import type { Group, GroupDetails, NewGroup } from '../types/backend.ts';
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
    const { client, useGetGroupDetails } = useGroupManagementClient(clientConfig);

    const groupDetails = useGetGroupDetails(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { groupId },
        },
        { enabled: false, initialData: prefetchedGroupDetails },
    );

    if (groupDetails.error) {
        setErrorMessage(`Failed to query Group ${groupName}: ${stringifyMaybeAxiosError(groupDetails.error)}`);
    }

    const addUserToGroup = useCallback(
        async (username: string) => {
            await callAddToGroup(accessToken, setErrorMessage, client, groupDetails.refetch)(groupId, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, client, groupId],
    );

    const removeFromGroup = useCallback(
        async (username: string) => {
            await callRemoveFromGroup(accessToken, setErrorMessage, client, groupDetails.refetch)(groupId, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, client, groupId],
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
    const { client } = useGroupManagementClient(clientConfig);

    const createGroup = useCallback(
        async (group: NewGroup) => callCreateGroup(accessToken, client)(group),
        [accessToken, client],
    );

    return {
        createGroup,
    };
};

export const useGetGroups = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const { client } = useGroupManagementClient(clientConfig);

    const getGroups = useCallback(
        async (groupName?: string) => callGetGroups(accessToken, client)(groupName),
        [accessToken, client],
    );

    return {
        getGroups,
    };
};

export const useGroupEdit = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const { client } = useGroupManagementClient(clientConfig);

    const editGroup = useCallback(
        async (groupId: number, group: NewGroup) => callEditGroup(accessToken, client)(groupId, group),
        [accessToken, client],
    );

    return {
        editGroup,
    };
};

export const useGroupManagementClient = (clientConfig: ClientConfig) => {
    const client = useMemo(() => new ApiClient(clientConfig.backendUrl, groupManagementApi), [clientConfig]);
    const useGetGroupDetails = useMemo(() => makeQueryHook(client, 'getGroupDetails'), [client]);
    return {
        client,
        useGetGroupDetails,
    };
};

type GroupManagementApiClient = ApiClient<typeof groupManagementApi>;

type CreateGroupSuccess = {
    succeeded: true;
    group: Group;
};
type CreateGroupError = {
    succeeded: false;
    errorMessage: string;
};
export type CreateGroupResult = CreateGroupSuccess | CreateGroupError;

function callCreateGroup(accessToken: string, client: GroupManagementApiClient) {
    return async (group: NewGroup) => {
        try {
            const groupResult = await client.request('createGroup', {
                body: group,
                headers: createAuthorizationHeader(accessToken),
            });
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

function callGetGroups(accessToken: string, client: GroupManagementApiClient) {
    return async (groupName?: string) => {
        try {
            const existingGroups = await client.request('getAllGroups', {
                headers: createAuthorizationHeader(accessToken),
                queries: { name: groupName },
            });
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

function callEditGroup(accessToken: string, client: GroupManagementApiClient) {
    return async (groupId: number, group: NewGroup) => {
        try {
            const groupResult = await client.request('editGroup', {
                body: group,
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId,
                },
            });
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

function callRemoveFromGroup(
    accessToken: string | undefined,
    openErrorFeedback: (message: string | undefined) => void,
    client: GroupManagementApiClient,
    refetchGroups: () => Promise<unknown>,
) {
    return async (groupId: number, username: string) => {
        try {
            await client.request('removeUserFromGroup', {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId,
                    userToRemove: username,
                },
            });
            await refetchGroups();
        } catch (error) {
            const message = `Failed to leave group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}

function callAddToGroup(
    accessToken: string | undefined,
    openErrorFeedback: (message: string | undefined) => void,
    client: GroupManagementApiClient,
    refetchGroups: () => Promise<unknown>,
) {
    return async (groupId: number, username: string) => {
        try {
            await client.request('addUserToGroup', {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId,
                    userToAdd: username,
                },
            });
            await refetchGroups();
        } catch (error) {
            const message = `Failed to add user to group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}
