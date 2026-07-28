import { type Result, ok, err } from 'neverthrow';
import Papa from 'papaparse';

import { SUBMISSION_ID_INPUT_FIELD } from '../../../settings';

// File columns begin with the 'files.' prefix and contain space-separated entries
export const FILES_HEADER_PREFIX = 'files.';
export const FILE_ENTRY_SEPARATOR = ' ';

// File entries can have one of the following forms: name, name::path, name::path:id, name:id
const FILE_ENTRY_REGEX = /^([^:]+)(?:::([^:]+))?(?::([^:]+))?$/;

type SubmissionId = string;
type FileCategory = string;
type FilePath = string;

export type SubmissionFile = {
    name: string;
    path: string;
    fileId?: string;
};
export type FileMapping = Map<FileCategory, Map<FilePath, SubmissionFile>>;
export type SubmissionFileMapping = Map<SubmissionId, FileMapping>;

type ResolvedSubmissionFile = SubmissionFile & { fileId: string };
type ResolvedFileMapping = Map<FileCategory, Map<FilePath, ResolvedSubmissionFile>>;
type ResolvedSubmissionFileMapping = Map<SubmissionId, ResolvedFileMapping>;

// File linkage details between the files declared within the metadata and the uploaded files
export type FileLinkageDetails = {
    // The metadata contains a fileName(::filePath), and it matches an uploaded file
    linked: SubmissionFile[];

    // The metadata contains a fileName:fileId, referencing a pre-existing file (no new files uploaded)
    reused: SubmissionFile[];

    // The metadata contains a fileName(::filePath), but no file has been uploaded which matches it
    missing: SubmissionFile[];

    // A new file has been uploaded, but is not pointed to by the metadata.
    // Either the file is missing from the metadata, or a metadata entry with the same path already has a file ID
    orphaned: SubmissionFile[];
};

export type FileLinkage = {
    submissionFileMapping: ResolvedSubmissionFileMapping;
    details: Map<FileCategory, FileLinkageDetails>;
};

export function getFileLinkage(
    submissionFileMapping: SubmissionFileMapping,
    folderFileMapping: FileMapping,
): FileLinkage {
    const resolvedSubmissionFileMapping: ResolvedSubmissionFileMapping = new Map();

    // Populate the resolved submissionFileMapping
    // This consists of the submissionFileMapping from the metadata,
    // populated with file IDs from the folder file mapping
    for (const [submissionId, categoryMapping] of submissionFileMapping) {
        const resolvedCategoryMapping: ResolvedFileMapping = new Map();

        for (const [category, pathMapping] of categoryMapping) {
            const resolvedPathMapping = new Map<FilePath, ResolvedSubmissionFile>();

            for (const [filePath, file] of pathMapping) {
                // Files between the two mappings are matched on file path
                const uploadFileId = folderFileMapping.get(category)?.get(filePath)?.fileId;

                // If for a given file path, the metadata already contains a file ID,
                // then this metadata ID takes precedence over the file ID from the upload
                const fileId = file.fileId ?? uploadFileId;

                if (fileId === undefined) continue;

                resolvedPathMapping.set(filePath, { ...file, fileId });
            }
            resolvedCategoryMapping.set(category, resolvedPathMapping);
        }
        resolvedSubmissionFileMapping.set(submissionId, resolvedCategoryMapping);
    }

    // File categories over both the metadata and upload folders
    const categories = new Set<FileCategory>([
        ...[...submissionFileMapping.values()].flatMap((fileMapping) => [...fileMapping.keys()]),
        ...folderFileMapping.keys(),
    ]);

    // Partition linkage details into linked, reused, missing and orphaned files
    const linkageDetails = new Map<FileCategory, FileLinkageDetails>();
    for (const category of categories) {
        const referencedFileIds = new Set<string>();

        for (const resolvedCategoryMapping of resolvedSubmissionFileMapping.values()) {
            const resolvedFiles = resolvedCategoryMapping.get(category)?.values() ?? [];
            for (const file of resolvedFiles) referencedFileIds.add(file.fileId);
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

    return { submissionFileMapping: resolvedSubmissionFileMapping, details: linkageDetails };
}

export function getLinkageError(details: Map<FileCategory, FileLinkageDetails>): string | undefined {
    const errors: string[] = [];
    const getFilePaths = (files: SubmissionFile[]) => files.map((file) => file.path).join(', ');

    for (const [category, { reused, missing, orphaned }] of details) {
        // An orphan sharing a path with a reused entry is shadowed by that entry's file ID, rather
        // than missing from the metadata - so it needs the actionable message instead.
        const reusedPaths = new Set(reused.map((file) => file.path));
        const shadowed = orphaned.filter((file) => reusedPaths.has(file.path));
        const unreferenced = orphaned.filter((file) => !reusedPaths.has(file.path));

        if (missing.length > 0)
            errors.push(
                `The following ${category} files were referenced in metadata but not uploaded: ${getFilePaths(missing)}.`,
            );
        if (unreferenced.length > 0)
            errors.push(
                `The following ${category} files were uploaded but not referenced in metadata: ${getFilePaths(unreferenced)}.`,
            );
        if (shadowed.length > 0)
            errors.push(
                `The following ${category} files were uploaded but the metadata still references an existing file for them: ${getFilePaths(shadowed)}. Remove the file ID from the metadata entry to replace it.`,
            );
    }
    return errors.length > 0 ? errors.join(' ') : undefined;
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

            // Validate each submission has unique file names and paths
            const fileNames = new Set<string>();
            const filePaths = new Set<string>();
            for (const result of fileEntryResults) {
                if (result.isErr()) return err(result.error);

                const file = result.value;
                if (fileNames.has(file.name))
                    return err(
                        new Error(
                            `Found duplicate file names for entry ${submissionId} in the ${fileCategory} category: ${file.name}`,
                        ),
                    );
                if (filePaths.has(file.path))
                    return err(
                        new Error(
                            `Found duplicate file paths for entry ${submissionId} in the ${fileCategory} category: ${file.path}`,
                        ),
                    );

                fileNames.add(file.name);
                filePaths.add(file.path);
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
        // Pad to the header, so that rows without files still line up with any appended column.
        const newRow = Array.from({ length: header.length }, (_, index) => row[index] ?? '');
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
