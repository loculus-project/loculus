import { siloVersionStatuses } from './types/lapis.ts';

export const pageSize = 100;

export const ACCESSION_VERSION_FIELD = 'accessionVersion';
export const ACCESSION_FIELD = 'accession';
export const VERSION_FIELD = 'version';
export const VERSION_STATUS_FIELD = 'versionStatus';
export const IS_REVOCATION_FIELD = 'isRevocation';
export const SUBMITTED_AT_FIELD = 'submittedAt';
export const RELEASED_AT_FIELD = 'releasedAt';
export const SUBMITTER_FIELD = 'submitter';
export const GROUP_FIELD = 'group';

export const hiddenDefaultSearchFilters = [
    { name: VERSION_STATUS_FIELD, filterValue: siloVersionStatuses.latestVersion, type: 'string' as const },
    { name: IS_REVOCATION_FIELD, filterValue: 'false', type: 'string' as const },
];
