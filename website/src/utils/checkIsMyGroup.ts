import { GroupManagementClient } from '../services/groupManagementClient.ts';

export const checkIsMyGroup = async (accessToken: string, groupId: number): Promise<boolean> => {
    return (await GroupManagementClient.create().getGroupsOfUser(accessToken)).match(
        (groups) => groups.some((myGroupItem) => myGroupItem.groupId === groupId),
        () => false,
    );
};
