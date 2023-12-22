import { Zodios, type ZodiosInstance } from '@zodios/core';
import { ZodiosHooks } from '@zodios/react';
import { useCallback, useMemo } from 'react';

import { groupManagementApi } from '../services/groupManagementApi.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

type UseGroupOperationsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    setErrorMessage: (message?: string) => void;
};

export const useGroupManagerHooks = ({ clientConfig, accessToken, setErrorMessage }: UseGroupOperationsProps) => {
    const { zodios, zodiosHooks } = useGroupManagementClient(clientConfig);

    const groupsOfUser = zodiosHooks.useGetGroupsOfUser({
        headers: createAuthorizationHeader(accessToken),
    });

    if (groupsOfUser.error) {
        setErrorMessage(`Failed to query Groups: ${stringifyMaybeAxiosError(groupsOfUser.error)}`);
    }

    const createGroup = useCallback(
        async (newGroupName: string) => {
            await callCreateGroup(accessToken, setErrorMessage, groupsOfUser.refetch, zodios)(newGroupName);
        },
        [accessToken, setErrorMessage, groupsOfUser.refetch, zodios],
    );

    const leaveGroup = useCallback(
        async (groupName: string, username: string) => {
            await callRemoveFromGroup(accessToken, setErrorMessage, groupsOfUser.refetch, zodios)(groupName, username);
        },
        [accessToken, setErrorMessage, groupsOfUser.refetch, zodios],
    );

    return {
        createGroup,
        leaveGroup,
        groupsOfUser,
    };
};

export const useGroupPageHooks = ({
    clientConfig,
    accessToken,
    setErrorMessage,
    groupName,
}: UseGroupOperationsProps & { groupName: string }) => {
    const { zodios, zodiosHooks } = useGroupManagementClient(clientConfig);

    const groupDetails = zodiosHooks.useGetUsersOfGroup({
        headers: createAuthorizationHeader(accessToken),
        params: {
            detailsOfGroupName: groupName,
        },
    });

    if (groupDetails.error) {
        setErrorMessage(`Failed to query Group ${groupName}: ${stringifyMaybeAxiosError(groupDetails.error)}`);
    }

    const addUserToGroup = useCallback(
        async (username: string) => {
            await callAddToGroup(accessToken, setErrorMessage, groupDetails.refetch, zodios)(groupName, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, zodios, groupName],
    );

    const removeFromGroup = useCallback(
        async (username: string) => {
            await callRemoveFromGroup(accessToken, setErrorMessage, groupDetails.refetch, zodios)(groupName, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, zodios, groupName],
    );

    return {
        addUserToGroup,
        removeFromGroup,
        groupDetails,
    };
};

export const useGroupManagementClient = (clientConfig: ClientConfig) => {
    const zodios = useMemo(() => new Zodios(clientConfig.backendUrl, groupManagementApi), [clientConfig]);
    const zodiosHooks = useMemo(() => new ZodiosHooks('pathoplexus', zodios), [zodios]);
    return {
        zodios,
        zodiosHooks,
    };
};

function callCreateGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    refetchGroups: () => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
) {
    return async (groupName: string) => {
        try {
            await zodios.createGroup(
                {
                    groupName,
                },
                {
                    headers: createAuthorizationHeader(accessToken),
                },
            );
            refetchGroups();
        } catch (error) {
            const message = `Failed to create group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}

function callRemoveFromGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    refetchGroups: () => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
) {
    return async (groupName: string, username: string) => {
        try {
            await zodios.removeUserFromGroup(undefined, {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupName,
                    userToRemove: username,
                },
            });
            refetchGroups();
        } catch (error) {
            const message = `Failed to leave group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}

function callAddToGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    refetchGroups: () => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
) {
    return async (groupName: string, username: string) => {
        try {
            await zodios.addUserToGroup(undefined, {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupName,
                    userToAdd: username,
                },
            });
            refetchGroups();
        } catch (error) {
            const message = `Failed to add user to group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}
