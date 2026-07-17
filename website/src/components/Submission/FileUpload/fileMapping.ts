import { type Result, ok, err } from 'neverthrow';
import Papa from 'papaparse';

import { SUBMISSION_ID_INPUT_FIELD } from '../../../settings';

// File columns begin with the 'files.' prefix.
// File entries are space-separated and can have one of the following forms: name, name::path, name::path:fileId
export const FILES_HEADER_PREFIX = 'files.';
export const FILE_ENTRY_SEPARATOR = ' ';
const FILE_ENTRY_REGEX = /^([^:]+)(?:::([^:]+))?(?::([^:]+))?$/; // TODO: Add name:fileId

export type SubmissionFile = {
    name: string;
    path: string;
    fileId?: string;
};
type SubmissionId = string;
type FileCategory = string;
type FilePath = string;
export type FileMapping = Map<FileCategory, Map<FilePath, SubmissionFile>>;
export type SubmissionFileMapping = Map<SubmissionId, FileMapping>;

function parseFileEntry(entry: string): Result<SubmissionFile, Error> {
    const match = FILE_ENTRY_REGEX.exec(entry.trim());
    if (!match)
        return err(
            new Error(
                'Failed to parse file entry. Please ensure all file entries are one of: name, name::path, name::path:id, name:id.',
            ),
        );
    const [, name, path, fileId] = match;
    return ok({ name, path: !path ? name : path, fileId });
}

export function parseSubmissionFileMapping(text: string): Result<SubmissionFileMapping, Error> {
    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });

    if (parsed.data.length === 0) return err(new Error('Please provide a non-empty metadata file.'));
    const columns = parsed.data[0].map((column, index) => ({ name: column, index }));
    const rows = parsed.data.slice(1);

    const fileColumns = columns.filter((column) => column.name.startsWith(FILES_HEADER_PREFIX));
    const idColumn = columns.find((column) => [SUBMISSION_ID_INPUT_FIELD, 'submissionId'].includes(column.name));
    if (idColumn === undefined)
        return err(new Error('Missing id column. Please ensure this is included in the uploaded metadata file.'));

    const submissionFileMapping: SubmissionFileMapping = new Map();
    for (const row of rows) {
        const submissionId = row[idColumn.index] ?? '';
        if (submissionId.trim() === '')
            return err(new Error('Found empty id value within metadata file. Please ensure all rows contain ids.'));
        if (submissionFileMapping.has(submissionId))
            return err(
                new Error('Found duplicate ids within metadata file. Please ensure all rows contain unique ids.'),
            );

        const fileMapping: FileMapping = new Map();
        submissionFileMapping.set(submissionId, fileMapping);

        for (const fileColumn of fileColumns) {
            const fileCategory = fileColumn.name.slice(FILES_HEADER_PREFIX.length);
            const cell = row[fileColumn.index] ?? '';
            if (cell.trim() === '') continue;

            if (fileMapping.has(fileCategory))
                return err(
                    new Error(
                        'Found duplicate file category within metadata file. Please ensure all rows contain unique ids.',
                    ),
                );

            const fileEntryResults = cell
                .split(FILE_ENTRY_SEPARATOR)
                .map((entry) => entry.trim())
                .filter((entry) => entry !== '')
                .map((entry) => parseFileEntry(entry));

            const fileEntryError = fileEntryResults.find((result) => result.isErr());
            if (fileEntryError !== undefined) return err(new Error(fileEntryError.error.message));

            const fileEntries = new Map(
                fileEntryResults.filter((entry) => entry.isOk()).map((entry) => [entry.value.path, entry.value]),
            );
            fileMapping.set(fileCategory, fileEntries);
        }
    }

    return ok(submissionFileMapping);
}

export function mergeFileMappings(
    submissionFileMapping: SubmissionFileMapping,
    folderFileMapping: FileMapping,
): Result<SubmissionFileMapping, Error> {
    const merged: SubmissionFileMapping = new Map();

    for (const [submissionId, fileMapping] of submissionFileMapping) {
        const newFileMapping: FileMapping = new Map();

        for (const [fileCategory, filePathMapping] of fileMapping) {
            const newCategoryMapping = new Map<string, SubmissionFile>();

            for (const [filePath, file] of filePathMapping) {
                const fileId = file.fileId ?? folderFileMapping.get(fileCategory)?.get(filePath)?.fileId;
                if (fileId === undefined)
                    return err(
                        new Error(
                            `No uploaded file for '${filePath}' in category '${fileCategory}' (entry '${submissionId}').`,
                        ),
                    );
                newCategoryMapping.set(filePath, { ...file, fileId });
            }
            newFileMapping.set(fileCategory, newCategoryMapping);
        }
        merged.set(submissionId, newFileMapping);
    }
    return ok(merged);
}

export async function applyFileMappings(metadataFile: File, merged: SubmissionFileMapping): Promise<File> {
    const text = await metadataFile.text();
    const rows = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true }).data;
    if (rows.length === 0) return metadataFile;

    const header = rows[0];
    const idIndex = header.findIndex((h) => [SUBMISSION_ID_INPUT_FIELD, 'submissionId'].includes(h));
    const fileColumns = header
        .map((name, index) => ({ category: name.slice(FILES_HEADER_PREFIX.length), index }))
        .filter(({ index }) => header[index].startsWith(FILES_HEADER_PREFIX));

    const newRows = rows.slice(1).map((row) => {
        const submissionId = idIndex >= 0 ? (row[idIndex] ?? '') : '';
        const newRow = [...row];
        for (const { category, index } of fileColumns) {
            const files = merged.get(submissionId)?.get(category);
            if (files === undefined) continue; // leave empty cells as-is
            newRow[index] = [...files.values()].map((f) => `${f.name}:${f.fileId}`).join(FILE_ENTRY_SEPARATOR);
        }
        return newRow;
    });

    const newContent = Papa.unparse([header, ...newRows], { delimiter: '\t', newline: '\n' });
    return new File([newContent], 'metadata.tsv', { type: 'text/tab-separated-values' });
}
