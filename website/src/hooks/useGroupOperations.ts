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
        async (group: NewGroup) => callCreateGroup(accessToken, zodios)(group),
        [accessToken, zodios],
    );

    return {
        createGroup,
    };
};

export const useGroupEdit = ({
    clientConfig,
    accessToken,
}: {
    clientConfig: ClientConfig;
    accessToken: string;
}) => {
    const { zodios } = useGroupManagementClient(clientConfig);

    const editGroup = useCallback(
        async (groupId: number, group: NewGroup) => callEditGroup(accessToken, zodios)(groupId, group),
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

type CreateGroupSuccess = {
    succeeded: true;
    group: Group;
};
type CreateGroupError = {
    succeeded: false;
    errorMessage: string;
};
export type CreateGroupResult = CreateGroupSuccess | CreateGroupError;

function callCreateGroup(accessToken: string, zodios: ZodiosInstance<typeof groupManagementApi>) {
    return async (group: NewGroup) => {
        try {
            const groupResult = await zodios.createGroup(group, {
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

function callEditGroup(accessToken: string, zodios: ZodiosInstance<typeof groupManagementApi>) {
    // TODO
    return async (groupId: number, group: NewGroup) => {
        try {
            const groupResult = await zodios.editGroup(group, {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId
                }
            });
            return {
                succeeded: true,
                group: groupResult,
            } as CreateGroupSuccess;  // TODO change type 
        } catch (error) {
            const message = `Failed to create group: ${stringifyMaybeAxiosError(error)}`;
            return {
                succeeded: false,
                errorMessage: message,
            } as CreateGroupError;
        }
    };
}

function callRemoveFromGroup(
    accessToken: string,
    openErrorFeedback: (message: string | undefined) => void,
    zodios: ZodiosInstance<typeof groupManagementApi>,
    refetchGroups?: () => void,
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
    return async (groupId: number, username: string) => {
        try {
            await zodios.addUserToGroup(undefined, {
                headers: createAuthorizationHeader(accessToken),
                params: {
                    groupId,
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
