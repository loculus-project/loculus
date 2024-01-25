import { siloVersionStatuses } from './types/lapis.ts';

export const pageSize = 100;

export const ACCESSION_FIELD = 'accession';
export const VERSION_FIELD = 'version';
export const VERSION_STATUS_FIELD = 'versionStatus';
export const IS_REVOCATION_FIELD = 'isRevocation';

export const hiddenDefaultSearchFilters = [
    { name: VERSION_STATUS_FIELD, filterValue: siloVersionStatuses.latestVersion, type: 'string' as const },
    { name: IS_REVOCATION_FIELD, filterValue: 'false', type: 'string' as const },
];
