import Papa from 'papaparse';

import { type FilesBySubmissionId } from '../../../types/backend.ts';

// Columns of the files.tsv from get-submitted-data; `id` matches the metadata.tsv `id` column.
const ID_COLUMN = 'id';
const CATEGORY_COLUMN = 'category';
const FILE_ID_COLUMN = 'fileId';
const FILE_NAME_COLUMN = 'fileName';

const REQUIRED_COLUMNS = [ID_COLUMN, CATEGORY_COLUMN, FILE_ID_COLUMN, FILE_NAME_COLUMN];

/**
 * Parses a files.tsv (one file per row) into {@link FilesBySubmissionId}, grouped by id then category.
 * Throws if a required column is missing or a row is malformed.
 */
export function parseExistingFilesTsv(content: string): FilesBySubmissionId {
    const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
    });

    const headers = parsed.meta.fields ?? [];
    const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missingColumns.length > 0) {
        throw new Error(`files.tsv is missing required column(s): ${missingColumns.join(', ')}`);
    }

    const fileMapping: FilesBySubmissionId = {};
    for (const row of parsed.data) {
        const submissionId = row[ID_COLUMN];
        const category = row[CATEGORY_COLUMN];
        const fileId = row[FILE_ID_COLUMN];
        const name = row[FILE_NAME_COLUMN];

        if (!submissionId || !category || !fileId || !name) {
            throw new Error('files.tsv contains a row with an empty id, category, fileId or fileName');
        }

        const filesByCategory = (fileMapping[submissionId] ??= {});
        (filesByCategory[category] ??= []).push({ fileId, name });
    }

    return fileMapping;
}
