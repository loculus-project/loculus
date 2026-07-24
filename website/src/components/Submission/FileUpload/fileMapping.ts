import { type Result, ok, err } from 'neverthrow';
import Papa from 'papaparse';

import { SUBMISSION_ID_INPUT_FIELD } from '../../../settings';

// File columns begin with the 'files.' prefix.
// File entries are space-separated and can have one of the following forms: name, name::path, name::path:id, name:id.
export const FILES_HEADER_PREFIX = 'files.';
export const FILE_ENTRY_SEPARATOR = ' ';
const FILE_ENTRY_REGEX = /^([^:]+)(?:::([^:]+))?(?::([^:]+))?$/;

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

/**
 * Details of file linkage between the files declared within the metadata and the uploaded files.
 * Linkage can fall into one of the four categories below:
 *
 * - Linked:    The metadata contains a fileName(::filePath), and it matches an uploaded file.
 * - Reused:    The metadata contains a fileName:fileId, referencing a pre-existing file (no new files uploaded).
 * - Missing:   The metadata contains a fileName(::filePath), but no file has been uploaded which matches it.
 * - Orphaned:  A new file has been uploaded, but is not pointed to by the metadata. This could be because either
 *              the file path is missing from the metadata entirely, or a matching entry (by the same path) already has a file ID.
 */
export type FileLinkageDetails = {
    linked: SubmissionFile[];
    reused: SubmissionFile[];
    missing: SubmissionFile[];
    orphaned: SubmissionFile[];
};

export type FileLinkage = {
    resolvedFileMapping: SubmissionFileMapping;
    details: Map<FileCategory, FileLinkageDetails>;
};

export function getFileLinkage(
    submissionFileMapping: SubmissionFileMapping,
    folderFileMapping: FileMapping,
): FileLinkage {
    // Construct resolved file mapping
    // Consists of the submission file mapping (from the metadata), but with file IDs
    // filled in from the folder uploads - matches are made on file path.
    const resolvedFileMapping: SubmissionFileMapping = new Map();

    for (const [submissionId, categoryMapping] of submissionFileMapping) {
        const resolvedCategoryMapping: FileMapping = new Map();

        for (const [category, pathMapping] of categoryMapping) {
            const resolvedPathMapping = new Map<FilePath, SubmissionFile>();

            for (const [filePath, file] of pathMapping) {
                const fileId = file.fileId ?? folderFileMapping.get(category)?.get(filePath)?.fileId;
                resolvedPathMapping.set(filePath, { ...file, fileId });
            }
            resolvedCategoryMapping.set(category, resolvedPathMapping);
        }
        resolvedFileMapping.set(submissionId, resolvedCategoryMapping);
    }

    // Partition linkage details into linked, reused, missing and orphaned files
    const categories = new Set<FileCategory>([
        ...folderFileMapping.keys(),
        ...[...submissionFileMapping.values()].flatMap((fileMapping) => [...fileMapping.keys()]),
    ]);

    const linkageDetails = new Map<FileCategory, FileLinkageDetails>();
    for (const category of categories) {
        const referencedFileIds = new Set<string>();

        for (const resolvedCategoryMapping of resolvedFileMapping.values()) {
            const resolvedFiles = resolvedCategoryMapping.get(category)?.values() ?? [];

            for (const file of resolvedFiles) {
                if (file.fileId !== undefined) referencedFileIds.add(file.fileId);
            }
        }

        const linked: SubmissionFile[] = [];
        const orphaned: SubmissionFile[] = [];

        const folderPathMapping = folderFileMapping.get(category);
        const folderFiles = folderPathMapping?.values() ?? [];

        for (const file of folderFiles) {
            if (file.fileId !== undefined && referencedFileIds.has(file.fileId)) linked.push(file);
            else orphaned.push(file);
        }

        const reused: SubmissionFile[] = [];
        const missing: SubmissionFile[] = [];

        for (const fileMapping of submissionFileMapping.values()) {
            for (const file of fileMapping.get(category)?.values() ?? []) {
                if (file.fileId !== undefined) {
                    reused.push(file);
                } else if (folderPathMapping?.get(file.path) === undefined) {
                    missing.push(file);
                } else {
                    // Entry has no file ID but is present in the folder - it is linked
                    continue;
                }
            }
        }
        linkageDetails.set(category, { linked, reused, orphaned, missing });
    }

    return { resolvedFileMapping, details: linkageDetails };
}

export function getLinkageError(details: Map<FileCategory, FileLinkageDetails>): string | undefined {
    const problems: string[] = [];
    for (const [category, { missing, orphaned }] of details) {
        if (missing.length > 0)
            problems.push(
                `The following ${category} files were referenced in metadata but not uploaded: ${missing.map((file) => file.path).join(', ')}.`,
            );
        if (orphaned.length > 0)
            problems.push(
                `The following ${category} files were uploaded but not referenced in metadata: ${orphaned.map((file) => file.path).join(', ')}.`,
            );
    }
    return problems.length > 0 ? problems.join(' ') : undefined;
}

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
    if (fileColumns.length === 0) return ok(new Map());

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
                new Error(
                    `Found duplicate ids within metadata file: ${submissionId}. Please ensure all rows contain unique ids.`,
                ),
            );

        const fileMapping: FileMapping = new Map();
        submissionFileMapping.set(submissionId, fileMapping);

        for (const fileColumn of fileColumns) {
            const fileCategory = fileColumn.name.slice(FILES_HEADER_PREFIX.length);
            const cell = row[fileColumn.index] ?? '';
            if (cell.trim() === '') continue;

            if (fileMapping.has(fileCategory))
                return err(new Error(`Found duplicate file category within metadata file: ${fileCategory}`));

            const fileEntryResults = cell
                .split(FILE_ENTRY_SEPARATOR)
                .map((entry) => entry.trim())
                .filter((entry) => entry !== '')
                .map((entry) => parseFileEntry(entry));

            // Validate each submission has unique file names
            const fileNames = new Set<string>();
            for (const result of fileEntryResults) {
                if (result.isErr()) return err(result.error);

                const file = result.value;
                if (fileNames.has(file.name))
                    return err(
                        new Error(
                            `Found duplicate file names for entry ${submissionId} in the ${fileCategory} category: ${file.name}`,
                        ),
                    );

                fileNames.add(result.value.name);
            }

            const fileEntries = new Map(
                fileEntryResults.filter((entry) => entry.isOk()).map((entry) => [entry.value.path, entry.value]),
            );
            fileMapping.set(fileCategory, fileEntries);
        }
    }

    return ok(submissionFileMapping);
}

export async function applyFileMappings(metadataFile: File, merged: SubmissionFileMapping): Promise<File> {
    const text = await metadataFile.text();
    const rows = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true }).data;
    if (rows.length === 0) return metadataFile;

    const header = rows[0];

    // ensure a column exists for every (category) present in the merged mapping
    const categories = new Set<string>();
    for (const byCategory of merged.values()) for (const c of byCategory.keys()) categories.add(c);
    for (const category of categories) {
        const name = `${FILES_HEADER_PREFIX}${category}`;
        if (!header.includes(name)) header.push(name); // header is a mutable copy
    }

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
