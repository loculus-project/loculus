import { err, ok, type Result } from 'neverthrow';

import { getAccessToken } from './getAccessToken.ts';
import { GroupManagementClient } from '../services/groupManagementClient.ts';
import type { Group } from '../types/backend.ts';

export type GetGroupsResult = Result<Group[], GetGroupsError>;

export type GetGroupsError = {
    type: 'not_logged_in' | 'could_not_load_groups';
};

export type GetGroupsAndCurrentGroupResult = Result<GetGroupsAndCurrentGroupValue, GetGroupsAndCurrentGroupError>;

export type GetGroupsAndCurrentGroupValue = {
    currentGroup: Group;
    groupsOfUser: Group[];
};

export type GetGroupsAndCurrentGroupError =
    | GetGroupsError
    | {
          type: 'missing_group_id' | 'group_not_found';
      };

export const getGroups = async (session: Session | undefined): Promise<GetGroupsResult> => {
    const accessToken = getAccessToken(session);
    if (accessToken === undefined) {
        return err({
            type: 'not_logged_in',
        });
    }

    const groupsResult = await GroupManagementClient.create().getGroupsOfUser(accessToken);
    if (groupsResult.isErr()) {
        return err({
            type: 'could_not_load_groups',
        });
    }
    const groupsOfUser: Group[] = groupsResult.value;

    return ok(groupsOfUser);
};

export const getGroupsAndCurrentGroup = async (
    astroParams: Record<string, string | undefined>,
    session: Session | undefined,
): Promise<GetGroupsAndCurrentGroupResult> => {
    const groupsOfUserResult = await getGroups(session);
    if (groupsOfUserResult.isErr()) {
        return err(groupsOfUserResult.error);
    }
    const groupsOfUser = groupsOfUserResult.value;

    const groupId = parseInt(astroParams.groupId ?? '', 10);
    if (isNaN(groupId)) {
        return err({
            type: 'missing_group_id',
        });
    }

    const currentGroup = groupsOfUser.find((group) => group.groupId === groupId);
    if (currentGroup === undefined) {
        return err({
            type: 'group_not_found',
        });
    }

    return ok({ currentGroup, groupsOfUser });
};
