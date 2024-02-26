import { Zodios, type ZodiosInstance } from '@zodios/core';
import { ZodiosHooks } from '@zodios/react';
import { useCallback, useMemo } from 'react';

import { groupManagementApi } from '../services/groupManagementApi.ts';
import type { Group, GroupDetails } from '../types/backend.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';
import { stringifyMaybeAxiosError } from '../utils/stringifyMaybeAxiosError.ts';

type UseGroupOperationsProps = {
    clientConfig: ClientConfig;
    accessToken: string;
    setErrorMessage: (message?: string) => void;
};

export const useGroupPageHooks = ({
    clientConfig,
    accessToken,
    setErrorMessage,
    prefetchedGroupDetails,
}: UseGroupOperationsProps & { prefetchedGroupDetails: GroupDetails }) => {
    const groupName = prefetchedGroupDetails.group.groupName;
    const { zodios, zodiosHooks } = useGroupManagementClient(clientConfig);

    const groupDetails = zodiosHooks.useGetGroupDetails(
        {
            headers: createAuthorizationHeader(accessToken),
            params: { groupName },
        },
        { enabled: false, initialData: prefetchedGroupDetails },
    );

    if (groupDetails.error) {
        setErrorMessage(`Failed to query Group ${groupName}: ${stringifyMaybeAxiosError(groupDetails.error)}`);
    }

    const addUserToGroup = useCallback(
        async (username: string) => {
            await callAddToGroup(accessToken, setErrorMessage, zodios, groupDetails.refetch)(groupName, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, zodios, groupName],
    );

    const removeFromGroup = useCallback(
        async (username: string) => {
            await callRemoveFromGroup(accessToken, setErrorMessage, zodios, groupDetails.refetch)(groupName, username);
        },
        [accessToken, setErrorMessage, groupDetails.refetch, zodios, groupName],
    );

    return {
        addUserToGroup,
        removeFromGroup,
        groupDetails,
    };
};

export const useGroupCreation = ({ clientConfig, accessToken, setErrorMessage }: UseGroupOperationsProps) => {
    const { zodios } = useGroupManagementClient(clientConfig);

    const createGroup = useCallback(
        async (group: Group) => {
            await callCreateGroup(accessToken, setErrorMessage, zodios)(group);
        },
        [accessToken, setErrorMessage, zodios],
    );

    return {
        createGroup,
    };
};

export const useRemoveFromGroup = ({
    clientConfig,
    accessToken,
    setErrorMessage,
    refetchGroups,
}: UseGroupOperationsProps & { refetchGroups?: () => void }) => {
    const { zodios } = useGroupManagementClient(clientConfig);
    const removeFromGroup = useCallback(
        async (groupName: string, username: string) => {
            await callRemoveFromGroup(accessToken, setErrorMessage, zodios, refetchGroups)(groupName, username);
        },
        [accessToken, setErrorMessage, zodios, refetchGroups],
    );
    return {
        removeFromGroup,
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

function callCreateGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
) {
    return async (group: Group) => {
        try {
            await zodios.createGroup(group, {
                headers: createAuthorizationHeader(accessToken),
            });
        } catch (error) {
            const message = `Failed to create group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}

function callRemoveFromGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
    refetchGroups?: () => void,
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
            if (refetchGroups !== undefined) {
                refetchGroups();
            }
        } catch (error) {
            const message = `Failed to leave group: ${stringifyMaybeAxiosError(error)}`;
            openErrorFeedback(message);
        }
    };
}

function callAddToGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
    refetchGroups: () => void,
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
