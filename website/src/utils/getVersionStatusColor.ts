import { type VersionStatus, versionStatuses } from '../types/lapis.ts';

export const getVersionStatusColor = (versionStatus: VersionStatus) => {
    switch (versionStatus) {
        case versionStatuses.latestVersion:
            return 'text-green-500';
        default:
            return 'text-red-500';
    }
};
