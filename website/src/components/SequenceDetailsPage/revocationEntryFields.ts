import { type TableDataEntry } from './types';
import {
    ACCESSION_VERSION_FIELD,
    SUBMITTED_AT_FIELD,
    RELEASED_AT_FIELD,
    IS_REVOCATION_FIELD,
    ACCESSION_FIELD,
    VERSION_COMMENT_FIELD,
    VERSION_STATUS_FIELD,
    SUBMITTER_FIELD,
    GROUP_NAME_FIELD,
    VERSION_FIELD,
    GROUP_ID_FIELD,
    DATA_USE_TERMS_FIELD,
} from '../../settings';

/**
 * Revocation versions carry no sequence data and inherit no metadata from the version
 * they revoke, so only the fields describing the revocation itself are meaningful.
 * Everything else would render as 'N/A' or empty.
 */
export const relevantFieldsForRevocationVersions = [
    ACCESSION_VERSION_FIELD,
    ACCESSION_FIELD,
    IS_REVOCATION_FIELD,
    RELEASED_AT_FIELD,
    VERSION_COMMENT_FIELD,
    VERSION_STATUS_FIELD,
    SUBMITTED_AT_FIELD,
    SUBMITTER_FIELD,
    VERSION_FIELD,
    GROUP_NAME_FIELD,
    GROUP_ID_FIELD,
    DATA_USE_TERMS_FIELD,
];

/**
 * Restricts table data to the fields worth showing for a revocation version.
 * Used by both the sequence details page and the sequence preview modal so they agree.
 */
export const filterToRevocationRelevantFields = (tableData: TableDataEntry[]): TableDataEntry[] =>
    tableData.filter((entry) => relevantFieldsForRevocationVersions.includes(entry.name));
