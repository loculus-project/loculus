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
export type ResolvedSubmissionFile = SubmissionFile & {
    fileId: string;
};

export type FileMapping<T extends SubmissionFile = SubmissionFile> = Map<FileCategory, Map<FilePath, T>>;
export type SubmissionFileMapping<T extends SubmissionFile = SubmissionFile> = Map<SubmissionId, FileMapping<T>>;

// File linkage details between the files declared within the metadata and the uploaded files
export type FileLinkageDetails = {
    // The metadata contains a fileName(::filePath), and it matches an uploaded file
    linked: SubmissionFile[];

    // The metadata contains a fileName:fileId, referencing a pre-existing file (no new files uploaded)
    reused: SubmissionFile[];

    // The metadata contains a fileName(::filePath), but no file has been uploaded which matches it
    missing: SubmissionFile[];

    // A new file has been uploaded, but is missing from the metadata
    orphaned: SubmissionFile[];

    // A new file has been uploaded, and the metadata declares its path, but every entry
    // declaring it has its own file ID, so the upload itself is referenced by nothing
    shadowed: SubmissionFile[];
};

type LinkageEntry = {
    metadataEntries: { submissionId: SubmissionId; file: SubmissionFile }[];
    uploadFolderEntry?: ResolvedSubmissionFile;
};

type LinkageMapping = Map<FileCategory, Map<FilePath, LinkageEntry>>;

type ResolvedEntry = {
    submissionId: SubmissionId;
    category: FileCategory;
    path: FilePath;
    file: ResolvedSubmissionFile;
};

export type FileLinkage = {
    submissionFileMapping: SubmissionFileMapping<ResolvedSubmissionFile>;
    details: Map<FileCategory, FileLinkageDetails>;
};

function getLinkageMapping(
    submissionFileMapping: SubmissionFileMapping,
    folderFileMapping: FileMapping<ResolvedSubmissionFile> | undefined,
): LinkageMapping {
    const linkageMapping: LinkageMapping = new Map();

    const getLinkageEntry = (category: FileCategory, path: FilePath): LinkageEntry => {
        let pathMapping = linkageMapping.get(category);
        if (pathMapping === undefined) {
            pathMapping = new Map();
            linkageMapping.set(category, pathMapping);
        }
        let linkageEntry = pathMapping.get(path);
        if (linkageEntry === undefined) {
            linkageEntry = { metadataEntries: [] };
            pathMapping.set(path, linkageEntry);
        }
        return linkageEntry;
    };

    for (const [submissionId, categoryMapping] of submissionFileMapping) {
        for (const [category, pathMapping] of categoryMapping) {
            for (const [path, file] of pathMapping)
                getLinkageEntry(category, path).metadataEntries.push({ submissionId, file });
        }
    }

    if (folderFileMapping !== undefined) {
        for (const [category, pathMapping] of folderFileMapping) {
            for (const [path, file] of pathMapping) getLinkageEntry(category, path).uploadFolderEntry = file;
        }
    }

    return linkageMapping;
}

function getResolvedSubmissionFileMapping(entries: ResolvedEntry[]): SubmissionFileMapping<ResolvedSubmissionFile> {
    const resolvedSubmissionFileMapping: SubmissionFileMapping<ResolvedSubmissionFile> = new Map();

    for (const { submissionId, category, path, file } of entries) {
        let categoryMapping = resolvedSubmissionFileMapping.get(submissionId);
        if (categoryMapping === undefined) {
            categoryMapping = new Map();
            resolvedSubmissionFileMapping.set(submissionId, categoryMapping);
        }
        let pathMapping = categoryMapping.get(category);
        if (pathMapping === undefined) {
            pathMapping = new Map();
            categoryMapping.set(category, pathMapping);
        }
        pathMapping.set(path, file);
    }

    return resolvedSubmissionFileMapping;
}

export function getFileLinkage(
    submissionFileMapping: SubmissionFileMapping,
    folderFileMapping: FileMapping<ResolvedSubmissionFile> | undefined,
): FileLinkage {
    const linkageMapping = getLinkageMapping(submissionFileMapping, folderFileMapping);
    const linkageDetails = new Map<FileCategory, FileLinkageDetails>();
    const resolvedEntries: ResolvedEntry[] = [];

    for (const [category, pathMapping] of linkageMapping) {
        const categoryLinkageDetails: FileLinkageDetails = {
            linked: [],
            reused: [],
            missing: [],
            orphaned: [],
            shadowed: [],
        };

        for (const [path, linkageEntry] of pathMapping) {
            for (const { submissionId, file } of linkageEntry.metadataEntries) {
                if (file.fileId !== undefined) {
                    // A metadata file entry with its own file ID is reusing a pre-existing file
                    categoryLinkageDetails.reused.push(file);
                } else if (linkageEntry.uploadFolderEntry === undefined) {
                    // If the metadata file does not have its own file ID, and there is no upload file entry,
                    // then the file is missing
                    categoryLinkageDetails.missing.push(file);
                }

                // A file ID in the metadata takes precedence over the one from the upload
                const fileId = file.fileId ?? linkageEntry.uploadFolderEntry?.fileId;

                // Having either means the entry was linked or reused, so it belongs in the resolved mapping
                if (fileId !== undefined)
                    resolvedEntries.push({ submissionId, category, path, file: { ...file, fileId } });
            }

            if (linkageEntry.uploadFolderEntry === undefined) continue;

            if (linkageEntry.metadataEntries.some(({ file }) => file.fileId === undefined)) {
                // The uploaded file has (at least one) corresponding metadata entry, so is linked
                categoryLinkageDetails.linked.push(linkageEntry.uploadFolderEntry);
            } else if (linkageEntry.metadataEntries.length > 0) {
                // The uploaded file has corresponding metadata entries, but they all have file IDs
                categoryLinkageDetails.shadowed.push(linkageEntry.uploadFolderEntry);
            } else {
                // The uploaded file has no metadata entries
                categoryLinkageDetails.orphaned.push(linkageEntry.uploadFolderEntry);
            }
        }

        linkageDetails.set(category, categoryLinkageDetails);
    }

    return { submissionFileMapping: getResolvedSubmissionFileMapping(resolvedEntries), details: linkageDetails };
}

export function getLinkageErrors(details: Map<FileCategory, FileLinkageDetails>): string | undefined {
    const errors: string[] = [];
    const getFilePaths = (files: SubmissionFile[]) => files.map((file) => file.path).join(', ');

    for (const [category, { missing, orphaned, shadowed }] of details) {
        if (missing.length > 0)
            errors.push(
                `The following ${category} files were referenced in metadata but not uploaded: ${getFilePaths(missing)}.`,
            );
        if (orphaned.length > 0)
            errors.push(
                `The following ${category} files were uploaded but not referenced in metadata: ${getFilePaths(orphaned)}.`,
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
