import { Zodios, type ZodiosInstance } from '@zodios/core';
import { ZodiosHooks } from '@zodios/react';
import { useCallback, useMemo } from 'react';

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

// Generic result type for operations
type OperationSuccess<T> = { succeeded: true } & T;
type OperationError = { succeeded: false; errorMessage: string };
type OperationResult<T> = OperationSuccess<T> | OperationError;

// Exported result types for backwards compatibility
export type CreateGroupResult = OperationResult<{ group: Group }>;
export type GetGroupsResult = OperationResult<{ groups: Group[] }>;
export type EditGroupResult = OperationResult<{ group: Group }>;

// Helper to execute API calls with standardized error handling
async function executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    errorPrefix: string,
): Promise<OperationResult<T>> {
    try {
        const result = await operation();
        return { succeeded: true, ...result } as OperationSuccess<T>;
    } catch (error) {
        return {
            succeeded: false,
            errorMessage: `${errorPrefix}: ${stringifyMaybeAxiosError(error)}`,
        };
    }
}

export const useGroupPageHooks = ({
    clientConfig,
    accessToken,
    setErrorMessage,
    prefetchedGroupDetails,
}: UseGroupOperationsProps & { prefetchedGroupDetails: GroupDetails }) => {
    const groupName = prefetchedGroupDetails.group.groupName;
    const groupId = prefetchedGroupDetails.group.groupId;
    const { zodios, zodiosHooks } = useGroupManagementClient(clientConfig);

    const groupDetails = zodiosHooks.useGetGroupDetails(
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
            await callAddToGroup(accessToken, setErrorMessage, zodios, groupDetails.refetch)(groupId, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, zodios, groupId],
    );

    const removeFromGroup = useCallback(
        async (username: string) => {
            await callRemoveFromGroup(accessToken, setErrorMessage, zodios, groupDetails.refetch)(groupId, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, zodios, groupId],
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
    const { zodios } = useGroupManagementClient(clientConfig);

    const createGroup = useCallback(
        async (group: NewGroup) =>
            executeWithErrorHandling(async () => {
                const groupResult = await zodios.createGroup(group, {
                    headers: createAuthorizationHeader(accessToken),
                });
                return { group: groupResult };
            }, 'Failed to create group'),
        [accessToken, zodios],
    );

    return {
        createGroup,
    };
};

export const useGetGroups = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const { zodios } = useGroupManagementClient(clientConfig);

    const getGroups = useCallback(
        async (groupName?: string) =>
            executeWithErrorHandling(async () => {
                const existingGroups = await zodios.getAllGroups({
                    headers: createAuthorizationHeader(accessToken),
                    queries: { name: groupName },
                });
                return { groups: existingGroups };
            }, 'Failed to query existing groups'),
        [accessToken, zodios],
    );

    return {
        getGroups,
    };
};

export const useGroupEdit = ({ clientConfig, accessToken }: { clientConfig: ClientConfig; accessToken: string }) => {
    const { zodios } = useGroupManagementClient(clientConfig);

    const editGroup = useCallback(
        async (groupId: number, group: NewGroup) =>
            executeWithErrorHandling(async () => {
                const groupResult = await zodios.editGroup(group, {
                    headers: createAuthorizationHeader(accessToken),
                    params: { groupId },
                });
                return { group: groupResult };
            }, 'Failed to edit group'),
        [accessToken, zodios],
    );

    return {
        editGroup,
    };
};

export const useGroupManagementClient = (clientConfig: ClientConfig) => {
    const zodios = useMemo(() => new Zodios(clientConfig.backendUrl, groupManagementApi), [clientConfig]);
    const zodiosHooks = useMemo(() => new ZodiosHooks('loculus', zodios), [zodios]);
    return {
        zodios,
        zodiosHooks,
    };
};

function callRemoveFromGroup(
    accessToken: string | undefined,
    openErrorFeedback: (message: string | undefined) => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
    refetchGroups: () => Promise<unknown>,
) {
    return async (groupId: number, username: string) => {
        try {
            await zodios.removeUserFromGroup(undefined, {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId,
                    userToRemove: username,
                },
            });
            await refetchGroups();
        } catch (error) {
            openErrorFeedback(`Failed to leave group: ${stringifyMaybeAxiosError(error)}`);
        }
    };
}

function callAddToGroup(
    accessToken: string | undefined,
    openErrorFeedback: (message: string | undefined) => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
    refetchGroups: () => Promise<unknown>,
) {
    return async (groupId: number, username: string) => {
        try {
            await zodios.addUserToGroup(undefined, {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId,
                    userToAdd: username,
                },
            });
            await refetchGroups();
        } catch (error) {
            openErrorFeedback(`Failed to add user to group: ${stringifyMaybeAxiosError(error)}`);
        }
    };
}
