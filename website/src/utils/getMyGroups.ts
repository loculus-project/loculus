import { serverBackendApi } from '../services/serverApi.ts';

export const getMyGroups = async (accessToken: string) => {
    try {
        const groups = await serverBackendApi(accessToken).getGroupsOfUser();

        return groups.match(
            (groups) => groups,
            () => [],
        );
    } catch (_) {
        return [];
    }
};
