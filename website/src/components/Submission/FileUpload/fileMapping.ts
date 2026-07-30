import { type Result, ok, err } from 'neverthrow';
import Papa from 'papaparse';

import { SUBMISSION_ID_INPUT_FIELD } from '../../../settings';

const ID_COLUMNS = [SUBMISSION_ID_INPUT_FIELD, 'submissionId'];

// File columns begin with the 'files.' prefix and contain space-separated entries
export const FILES_HEADER_PREFIX = 'files.';
const FILES_SEPARATOR = ' ';
const FILE_NAME_ID_SEPARATOR = ':';

// File entries can have one of the following forms:
const FILE_ENTRY_FORMS = ['name', 'name::path', 'name::path:fileId', 'name:fileId'];
const FILE_ENTRY_REGEX = /^([^:]+)(?:::([^:]+))?(?::([^:]+))?$/;

export type SubmissionFile = {
    name: string;
    path: string;
    fileId?: string;
};
export type ResolvedSubmissionFile = SubmissionFile & {
    fileId: string;
};

type SubmissionId = string;
type FileCategory = string;
type FilePath = string;

export type FileMapping<T extends SubmissionFile = SubmissionFile> = Map<FileCategory, Map<FilePath, T>>;
export type SubmissionFileMapping<T extends SubmissionFile = SubmissionFile> = Map<SubmissionId, FileMapping<T>>;

/**
 * Types of file linkage between the files declared within the metadata and the uploaded files.
 *
 * Linkage can fall into one of the following categories:
 *
 * Linked: The metadata contains a name(::path), and it matches an uploaded file
 * Reused: The metadata contains a name:fileId, referencing a pre-existing file (no new files uploaded)
 * Missing: The metadata contains a name(::path), but no file has been uploaded which matches it
 * Orphaned: A new file has been uploaded, but is missing from the metadata
 * Shadowed: A new file has been uploaded, and the metadata declares its path, but every entry
 * declaring it has its own file ID, so the upload itself is referenced by nothing
 */
export enum LinkageType {
    LINKED = 'linked',
    REUSED = 'reused',
    MISSING = 'missing',
    ORPHANED = 'orphaned',
    SHADOWED = 'shadowed',
}

/**
 * A mapping of (file category, file path) to the metadata entries and uploaded files which reference them.
 */
type LinkageMapping = Map<
    FileCategory,
    Map<
        FilePath,
        {
            metadataEntries: { submissionId: SubmissionId; file: SubmissionFile }[];
            uploadEntry?: ResolvedSubmissionFile;
        }
    >
>;

/**
 * Returns a mapping of (file category, file path) to the metadata entries and uploaded files which reference them.
 * @param submissionFileMapping The mapping of submission IDs to file categories and paths, as declared in the metadata.
 * @param fileMapping The mapping of file categories and paths to uploaded files.
 * @returns A mapping of file categories and paths to the metadata entries and uploaded files which reference them.
 */
function getLinkageMapping(
    submissionFileMapping: SubmissionFileMapping,
    fileMapping: FileMapping<ResolvedSubmissionFile> | undefined,
): LinkageMapping {
    const linkageMapping: LinkageMapping = new Map();

    const getOrCreateLinkageEntry = (category: FileCategory, path: FilePath) => {
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
                getOrCreateLinkageEntry(category, path).metadataEntries.push({ submissionId, file });
        }
    }

    if (fileMapping !== undefined) {
        for (const [category, pathMapping] of fileMapping) {
            for (const [path, file] of pathMapping) getOrCreateLinkageEntry(category, path).uploadEntry = file;
        }
    }

    return linkageMapping;
}

/**
 * An entry containing the submission ID, file category, path, and resolved file.
 * Used to build a resolved submission file mapping, which contains the file IDs for all files which are linked or reused.
 */
type ResolvedEntry = {
    submissionId: SubmissionId;
    category: FileCategory;
    path: FilePath;
    file: ResolvedSubmissionFile;
};

/**
 * Returns a mapping of submission IDs to file categories and paths, containing the resolved files which are linked or reused.
 * @param entries The entries containing the submission ID, file category, path, and resolved file.
 * @returns A mapping of submission IDs to file categories and paths, containing the resolved files which are linked or reused.
 */
function getResolvedSubmissionFileMapping(entries: ResolvedEntry[]): SubmissionFileMapping<ResolvedSubmissionFile> {
    const resolvedSubmissionFileMapping: SubmissionFileMapping<ResolvedSubmissionFile> = new Map();

    const getOrCreateMapping = (
        submissionId: SubmissionId,
        category: FileCategory,
    ): Map<FilePath, ResolvedSubmissionFile> => {
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
        return pathMapping;
    };

    for (const { submissionId, category, path, file } of entries)
        getOrCreateMapping(submissionId, category).set(path, file);

    return resolvedSubmissionFileMapping;
}

export type CategoryLinkage = {
    [LinkageType.LINKED]: SubmissionFile[];
    [LinkageType.REUSED]: SubmissionFile[];
    [LinkageType.MISSING]: SubmissionFile[];
    [LinkageType.ORPHANED]: SubmissionFile[];
    [LinkageType.SHADOWED]: SubmissionFile[];
};

/**
 * A mapping of file categories to the linkage details within that category.
 */
export type FileLinkage = Map<FileCategory, CategoryLinkage>;

/**
 * Determines how each declared and uploaded file is linked, and produces a resolved submission file mapping from the valid entries.
 * @param submissionFileMapping The mapping of submission IDs to file categories and paths, as declared in the metadata.
 * @param fileMapping The mapping of file categories and paths to uploaded files.
 * @returns The resolved submission file mapping, and the file linkage details for each file category.
 */
export function resolveFileMappings(
    submissionFileMapping: SubmissionFileMapping,
    fileMapping: FileMapping<ResolvedSubmissionFile> | undefined,
): {
    submissionFileMapping: SubmissionFileMapping<ResolvedSubmissionFile>;
    fileLinkage: FileLinkage;
} {
    const linkageMapping = getLinkageMapping(submissionFileMapping, fileMapping);
    const fileLinkage: FileLinkage = new Map();
    const resolvedEntries: ResolvedEntry[] = [];

    for (const [category, pathMapping] of linkageMapping) {
        const categoryLinkage: CategoryLinkage = {
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
                    categoryLinkage.reused.push(file);
                } else if (linkageEntry.uploadEntry === undefined) {
                    // If the metadata file entry does not have its own file ID, and there is no uploaded file,
                    // then the file is missing
                    categoryLinkage.missing.push(file);
                }

                // A file ID in the metadata takes precedence over the one from the upload
                const fileId = file.fileId ?? linkageEntry.uploadEntry?.fileId;

                // A file ID from either metadata or upload resolves the entry
                // Shadowed uploads are reported separately and block submission
                if (fileId !== undefined)
                    resolvedEntries.push({ submissionId, category, path, file: { ...file, fileId } });
            }

            if (linkageEntry.uploadEntry === undefined) continue;

            if (linkageEntry.metadataEntries.some(({ file }) => file.fileId === undefined)) {
                // The uploaded file has (at least one) corresponding metadata entry, so is linked
                categoryLinkage.linked.push(linkageEntry.uploadEntry);
            } else if (linkageEntry.metadataEntries.length > 0) {
                // The uploaded file has corresponding metadata entries, but they all have file IDs
                categoryLinkage.shadowed.push(linkageEntry.uploadEntry);
            } else {
                // The uploaded file has no metadata entries
                categoryLinkage.orphaned.push(linkageEntry.uploadEntry);
            }
        }

        fileLinkage.set(category, categoryLinkage);
    }

    const resolvedSubmissionFileMapping = getResolvedSubmissionFileMapping(resolvedEntries);
    return { submissionFileMapping: resolvedSubmissionFileMapping, fileLinkage };
}

/**
 * Returns the error message for a linkage type which blocks submission.
 * @param type The linkage type.
 * @param category The file category the files belong to.
 * @param filePaths The affected file paths, formatted for display.
 * @returns The error message shown to the user.
 */
export function getLinkageErrorMessage(
    type: LinkageType.MISSING | LinkageType.ORPHANED | LinkageType.SHADOWED,
    category: FileCategory,
    filePaths: string,
): string {
    switch (type) {
        case LinkageType.MISSING:
            return `The following ${category} files were referenced in metadata but not uploaded: ${filePaths}.`;
        case LinkageType.ORPHANED:
            return `The following ${category} files were uploaded but not referenced in metadata: ${filePaths}.`;
        case LinkageType.SHADOWED:
            return `The following ${category} files were uploaded but the metadata still references an existing file for them: ${filePaths}. Remove the file ID from the metadata entry to replace it.`;
    }
}

/**
 * Collects the error messages of every linkage type which blocks submission, across all file categories.
 * @param fileLinkage The linkage details of each file category.
 * @returns The combined error message, or undefined if nothing blocks submission.
 */
export function getLinkageErrors(fileLinkage: FileLinkage): string | undefined {
    const errors: string[] = [];
    const getFilePaths = (files: SubmissionFile[]) => files.map((file) => file.path).join(', ');

    for (const [category, { missing, orphaned, shadowed }] of fileLinkage) {
        if (missing.length > 0)
            errors.push(getLinkageErrorMessage(LinkageType.MISSING, category, getFilePaths(missing)));
        if (orphaned.length > 0)
            errors.push(getLinkageErrorMessage(LinkageType.ORPHANED, category, getFilePaths(orphaned)));
        if (shadowed.length > 0)
            errors.push(getLinkageErrorMessage(LinkageType.SHADOWED, category, getFilePaths(shadowed)));
    }
    return errors.length > 0 ? errors.join(' ') : undefined;
}

/**
 * Parses a single file entry from a metadata file column, defaulting the path to the file name when absent.
 * @param entry The file entry, in one of the accepted `FILE_ENTRY_FORMS`.
 * @returns The parsed file, or an error if the entry matches none of the accepted forms.
 */
function parseFileEntry(entry: string): Result<SubmissionFile, Error> {
    const match = FILE_ENTRY_REGEX.exec(entry.trim());
    if (!match)
        return err(
            new Error(
                `Failed to parse file entry. Please ensure all file entries are one of: ${FILE_ENTRY_FORMS.join(', ')}.`,
            ),
        );
    const [, name, path, fileId] = match;
    return ok({ name, path: !path ? name : path, fileId });
}

/**
 * Returns the file columns of a metadata file, which declare the files associated with each submission.
 * @param columns The columns of the metadata file.
 * @returns An array of objects containing the file category and column index for each file column.
 */
const getFileColumns = (columns: { name: string; index: number }[]) =>
    columns
        .filter(({ name }) => name.startsWith(FILES_HEADER_PREFIX))
        .map(({ name, index }) => ({ category: name.slice(FILES_HEADER_PREFIX.length), index }));

/**
 * Returns the first column of a metadata file which contains submission IDs, or undefined if none exist.
 * @param columns The columns of the metadata file.
 * @returns An object containing the column name and index, or undefined if no ID column exists.
 */
const getIdColumn = (columns: { name: string; index: number }[]) =>
    columns.find(({ name }) => ID_COLUMNS.includes(name));

/**
 * Reads the file entries declared in the file columns of a metadata file, validating that submission IDs are
 * unique and that each submission declares unique file names and paths per category.
 * @param text The contents of the uploaded metadata file.
 * @returns A mapping of submission IDs to file categories and paths, or the first validation error encountered.
 */
export function parseSubmissionFileMapping(
    text: string,
    categories: FileCategory[],
): Result<SubmissionFileMapping, Error> {
    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
    if (parsed.data.length === 0) return err(new Error('Please provide a non-empty metadata file.'));

    const columns = parsed.data[0].map((column, index) => ({ name: column, index }));
    const rows = parsed.data.slice(1);

    // Columns containing file entries
    const fileColumns = getFileColumns(columns);
    if (fileColumns.length === 0) return ok(new Map());

    // Validate file categories declared in the metadata
    const fileCategories = fileColumns.map((column) => column.category);

    const unknownCategories = new Set(fileCategories.filter((category) => !categories.includes(category)));
    if (unknownCategories.size > 0)
        return err(
            new Error(`Found unknown file categories within metadata file: ${[...unknownCategories].join(', ')}.`),
        );

    const duplicateCategories = new Set(
        fileCategories.filter((category, index) => fileCategories.indexOf(category) !== index),
    );
    if (duplicateCategories.size > 0)
        return err(
            new Error(`Found duplicate file categories within metadata file: ${[...duplicateCategories].join(', ')}.`),
        );

    // Validate ID column exists
    const idColumn = getIdColumn(columns);
    if (idColumn === undefined)
        return err(new Error('Missing id column. Please ensure this is included in the uploaded metadata file.'));

    // Build a mapping of submission IDs to file categories and paths
    const submissionFileMapping: SubmissionFileMapping = new Map();
    for (const row of rows) {
        // Validate submission ID is present and unique
        const submissionId = row[idColumn.index] ?? '';
        if (submissionId.trim() === '')
            return err(new Error('Found empty id value within metadata file. Please ensure all rows contain ids.'));
        if (submissionFileMapping.has(submissionId))
            return err(
                new Error(
                    `Found duplicate ids within metadata file: ${submissionId}. Please ensure all rows contain unique ids.`,
                ),
            );

        // Build a mapping of file categories to file paths and entries for the submission
        const fileMapping: FileMapping = new Map();
        for (const { category, index } of fileColumns) {
            // Skip empty cells
            const cell = row[index] ?? '';
            if (cell.trim() === '') continue;

            // Parse each file entry in the cell
            const fileEntryResults = cell
                .split(FILES_SEPARATOR)
                .map((entry) => entry.trim())
                .filter((entry) => entry !== '')
                .map((entry) => parseFileEntry(entry));

            // Check for parsing errors in the file entries and
            // validate the submission has unique file names and paths
            const fileNames = new Set<string>();
            const fileEntries = new Map<FilePath, SubmissionFile>();
            for (const fileEntryResult of fileEntryResults) {
                if (fileEntryResult.isErr()) return err(fileEntryResult.error);
                const file = fileEntryResult.value;

                if (fileNames.has(file.name))
                    return err(
                        new Error(
                            `Found duplicate file names for entry ${submissionId} in the ${category} category: ${file.name}.`,
                        ),
                    );
                if (fileEntries.has(file.path))
                    return err(
                        new Error(
                            `Found duplicate file paths for entry ${submissionId} in the ${category} category: ${file.path}.`,
                        ),
                    );
                fileNames.add(file.name);
                fileEntries.set(file.path, file);
            }
            fileMapping.set(category, fileEntries);
        }
        submissionFileMapping.set(submissionId, fileMapping);
    }

    return ok(submissionFileMapping);
}

/**
 * Rewrites the file columns of a metadata file so that every entry references its resolved file ID, adding a
 * column for any category which the metadata file does not already declare.
 * @param metadataFile The metadata file uploaded by the user.
 * @param resolvedSubmissionFileMapping The resolved submission file mapping to write into the file columns.
 * @returns A new metadata file with the resolved file entries, or the first validation error encountered.
 */
export async function applyFileMappings(
    metadataFile: File,
    resolvedSubmissionFileMapping: SubmissionFileMapping<ResolvedSubmissionFile>,
): Promise<Result<File, Error>> {
    const text = await metadataFile.text();
    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
    if (parsed.data.length === 0) return err(new Error('Please provide a non-empty metadata file.'));

    // If there are no resolved file entries, return the original file
    if (resolvedSubmissionFileMapping.size === 0) return ok(metadataFile);

    const columnNames = parsed.data[0];
    const columns = columnNames.map((column, index) => ({ name: column, index }));
    const rows = parsed.data.slice(1);

    // Ensure a column exists for every category present in the resolved mapping
    const categories = new Set<string>();
    for (const fileMapping of resolvedSubmissionFileMapping.values())
        for (const category of fileMapping.keys()) categories.add(category);
    for (const category of categories) {
        const name = `${FILES_HEADER_PREFIX}${category}`;
        if (!columnNames.includes(name)) columns.push({ name, index: columns.length });
    }

    // Validate ID column exists
    const idColumn = getIdColumn(columns);
    if (idColumn === undefined)
        return err(new Error('Missing id column. Please ensure this is included in the uploaded metadata file.'));

    // Update the rows with file columns containing resolved file entries
    const fileColumns = getFileColumns(columns);
    const updatedRows = rows.map((row) => {
        const submissionId = row[idColumn.index] ?? '';

        // Pad to the number of columns, so that rows without files still line up with any appended column
        const updatedRow = Array.from({ length: columns.length }, (_, index) => row[index] ?? '');

        for (const { category, index } of fileColumns) {
            const files = resolvedSubmissionFileMapping.get(submissionId)?.get(category);
            if (files === undefined) continue;

            updatedRow[index] = [...files.values()]
                .map((file) => `${file.name}${FILE_NAME_ID_SEPARATOR}${file.fileId}`)
                .join(FILES_SEPARATOR);
        }
        return updatedRow;
    });

    const header = columns.map(({ name }) => name);
    const content = Papa.unparse([header, ...updatedRows], { delimiter: '\t', newline: '\n' });
    return ok(new File([content], 'metadata.tsv', { type: 'text/tab-separated-values' }));
}
