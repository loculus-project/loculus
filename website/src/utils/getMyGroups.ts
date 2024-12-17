import { GroupManagementClient } from '../services/groupManagementClient.js';

export const getMyGroups = async (accessToken: string): Promise<unknown[]> => {
    try {
        const groups = await GroupManagementClient.create().getGroupsOfUser(accessToken);

        return groups.match(
            (groups) => groups,
            () => [],
        );
    } catch (_) {
        return [];
    }
};
