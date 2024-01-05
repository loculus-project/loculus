import { type SiloVersionStatus, siloVersionStatuses } from '../types/lapis.ts';

export const getVersionStatusColor = (versionStatus: SiloVersionStatus) => {
    switch (versionStatus) {
        case siloVersionStatuses.latestVersion:
            return 'text-green-500';
        default:
            return 'text-red-500';
    }
};
