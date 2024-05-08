import { GroupManagementClient } from '../services/groupManagementClient.js';

export const getMyGroups = async (accessToken: string): Promise<any[]> => {
    try {
        const groups = await GroupManagementClient.create().getGroupsOfUser(accessToken);

        return groups.match(
            (groups) => groups,
            () => [],
        );
    } catch (error) {
        return [];
    }
};
