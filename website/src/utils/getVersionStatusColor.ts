import { type SiloVersionStatus } from '../services/lapisClient.ts';

export const getVersionStatusColor = (versionStatus: SiloVersionStatus) => {
    switch (versionStatus) {
        case 'LATEST_VERSION':
            return 'text-green-500';
        default:
            return 'text-red-500';
    }
};
