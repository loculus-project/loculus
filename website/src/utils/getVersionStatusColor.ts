import { type VersionStatus, versionStatuses } from '../types/lapis.ts';

export const getVersionStatusColor = (versionStatus: VersionStatus, isRevocation: boolean) => {
    if (isRevocation) {
        return 'text-red-500';
    }
    switch (versionStatus) {
        case versionStatuses.latestVersion:
            return 'text-green-500';
        default:
            return 'text-gray-400';
    }
};

export const getVersionStatusLabel = (versionStatus: VersionStatus, isRevocation: boolean) => {
    switch (versionStatus) {
        case versionStatuses.latestVersion:
            return isRevocation ? 'Sequence revoked' : 'Latest version';
        default:
            return 'Previous version';
    }
};
