import { type Result, ok, err } from 'neverthrow';
import Papa from 'papaparse';

import { FILES_HEADER_PREFIX, SUBMISSION_ID_INPUT_FIELD } from '../../../settings';

const ID_COLUMNS = [SUBMISSION_ID_INPUT_FIELD, 'submissionId'];

// File entries are space-separated, and can have one of the following forms:
const FILE_ENTRY_FORMS = ['name', 'name::path', 'name:fileId'];
const FILES_SEPARATOR = ' ';
const FILE_NAME_ID_SEPARATOR = ':';
const FILE_ENTRY_REGEX = /^([^:]+)(?:::([^:]+)|:([^:]+))?$/;

type SubmissionId = string;
type FileCategory = string;
type FilePath = string;
type FileName = string;
type FileId = string;

/*
 * A file declared in the metadata.
 * Declared metadata files must have a name - if a path is not provided, the name is used as the path.
 * Declared metadata files may have a file ID, meaning a pre-existing file is being reused.
 */
export type SubmissionFile = {
    name: string;
    path: string;
    fileId?: string;
};

/*
 * A file uploaded by the folder upload component.
 * Uploaded files must have a path, corresponding to their folder upload path,
 * as well as a file ID for the uploaded file.
 */
export type UploadedFile = {
    path: FilePath;
    fileId: FileId;
};

type ResolvedSubmissionFile = {
    name: string;
    path: string;
    fileId: string;
};

/**
 * An entry containing the submission ID, file category, and resolved file.
 * Used to build a resolved submission file mapping, which contains the file IDs for all files which are linked or reused.
 */
type ResolvedEntry = {
    submissionId: SubmissionId;
    category: FileCategory;
    file: ResolvedSubmissionFile;
};

/**
 * Files uploaded via the folder upload component, keyed by path. Paths are unique within an upload.
 * Every uploaded file has a file ID.
 */
export type FileMapping = Map<FileCategory, Map<FilePath, FileId>>;

/**
 * Files declared per submission in the metadata, keyed by name.
 */
export type SubmissionFileMapping<T extends SubmissionFile = SubmissionFile> = Map<
    SubmissionId,
    Map<FileCategory, Map<FileName, T>>
>;

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

export type CategoryLinkage = {
    [LinkageType.LINKED]: UploadedFile[];
    [LinkageType.REUSED]: SubmissionFile[];
    [LinkageType.MISSING]: SubmissionFile[];
    [LinkageType.ORPHANED]: UploadedFile[];
    [LinkageType.SHADOWED]: UploadedFile[];
};

function initialiseCategoryLinkage(): CategoryLinkage {
    return {
        [LinkageType.LINKED]: [],
        [LinkageType.REUSED]: [],
        [LinkageType.MISSING]: [],
        [LinkageType.ORPHANED]: [],
        [LinkageType.SHADOWED]: [],
    };
}

/**
 * A mapping of file categories to the linkage details within that category.
 */
export type FileLinkage = Map<FileCategory, CategoryLinkage>;

/**
 * Returns a mapping of submission IDs to file categories, containing the resolved files which are linked or reused.
 * @param entries The entries containing the submission ID, file category, and resolved file.
 * @returns A mapping of submission IDs to file categories, containing the resolved files which are linked or reused.
 */
function getResolvedSubmissionFileMapping(entries: ResolvedEntry[]): SubmissionFileMapping<ResolvedSubmissionFile> {
    const mapping: SubmissionFileMapping<ResolvedSubmissionFile> = new Map();

    for (const { submissionId, category, file } of entries) {
        const categoryMapping: Map<FileCategory, Map<FileName, ResolvedSubmissionFile>> = mapping.get(submissionId) ??
        new Map();
        const files: Map<FileName, ResolvedSubmissionFile> = categoryMapping.get(category) ?? new Map();

        files.set(file.name, file);

        categoryMapping.set(category, files);
        mapping.set(submissionId, categoryMapping);
    }

    return mapping;
}

/**
 * Determines how each declared and uploaded file is linked, and produces a resolved submission file mapping from the valid entries.
 * @param submissionFileMapping The mapping of submission IDs to file categories and names, as declared in the metadata.
 * @param fileMapping The mapping of file categories and paths to uploaded files.
 * @returns The resolved submission file mapping, and the file linkage details for each file category.
 */
export function resolveFileMappings(
    submissionFileMapping: SubmissionFileMapping,
    fileMapping: FileMapping | undefined,
): {
    submissionFileMapping: SubmissionFileMapping<ResolvedSubmissionFile>;
    fileLinkage: FileLinkage;
} {
    const fileLinkage: FileLinkage = new Map();
    const resolvedEntries: ResolvedEntry[] = [];

    // Every file category which appears on either side, so it gets linkage details even if only declared on one.
    const categories = new Set<FileCategory>();
    for (const categoryMapping of submissionFileMapping.values())
        for (const category of categoryMapping.keys()) categories.add(category);
    if (fileMapping !== undefined) for (const category of fileMapping.keys()) categories.add(category);

    for (const category of categories) {
        const categoryLinkage = initialiseCategoryLinkage();
        const uploads = fileMapping?.get(category);
        // Paths claimed by a metadata entry without its own file ID, so the upload is genuinely linked.
        const claimedPaths = new Set<FilePath>();
        // Paths referenced by a metadata entry which has its own file ID instead, so the upload is shadowed.
        const shadowedPaths = new Set<FilePath>();

        for (const [submissionId, categoryMapping] of submissionFileMapping) {
            const files = categoryMapping.get(category);
            if (files === undefined) continue;

            for (const file of files.values()) {
                if (file.fileId !== undefined) {
                    // A metadata file entry with its own file ID is reusing a pre-existing file,
                    // and does not need to be linked against any upload.
                    categoryLinkage.reused.push(file);
                    shadowedPaths.add(file.path);
                    resolvedEntries.push({ submissionId, category, file: { ...file, fileId: file.fileId } });
                    continue;
                }

                const fileId = uploads?.get(file.path);
                if (fileId === undefined) {
                    categoryLinkage.missing.push(file);
                    continue;
                }

                claimedPaths.add(file.path);
                resolvedEntries.push({ submissionId, category, file: { ...file, fileId } });
            }
        }

        if (uploads !== undefined) {
            for (const [path, fileId] of uploads) {
                if (claimedPaths.has(path)) categoryLinkage.linked.push({ path, fileId });
                else if (shadowedPaths.has(path)) categoryLinkage.shadowed.push({ path, fileId });
                else categoryLinkage.orphaned.push({ path, fileId });
            }
        }

        fileLinkage.set(category, categoryLinkage);
    }

    const resolvedSubmissionFileMapping = getResolvedSubmissionFileMapping(resolvedEntries);
    return { submissionFileMapping: resolvedSubmissionFileMapping, fileLinkage };
}

/**
 * Wraps a single submission's uploaded files into a resolved submission file mapping, for input modes
 * where every uploaded file is used exactly as uploaded, with no metadata file-linkage step. A path is
 * used as its own name, which is valid since these input modes never allow subdirectories, so a path is
 * always already just a file name.
 * @param submissionId The ID of the submission the uploaded files belong to.
 * @param fileMapping The mapping of file categories and paths to uploaded files.
 * @returns A resolved submission file mapping containing only the given submission.
 */
export function toSingleSubmissionFileMapping(
    submissionId: SubmissionId,
    fileMapping: FileMapping,
): SubmissionFileMapping<ResolvedSubmissionFile> {
    return new Map([
        [
            submissionId,
            new Map(
                [...fileMapping].map(([category, files]) => [
                    category,
                    new Map([...files].map(([path, fileId]) => [path, { name: path, path, fileId }])),
                ]),
            ),
        ],
    ]);
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
    const getFilePaths = (files: { path: FilePath }[]) => files.map((file) => file.path).join(', ');

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
 * unique and that each submission declares unique file names per category.
 * @param text The contents of the uploaded metadata file.
 * @returns A mapping of submission IDs to file categories and names, or the first validation error encountered.
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

    // Build a mapping of submission IDs to file categories and names
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

        // Build a mapping of file categories to file names and entries for the submission
        const categoryMapping = new Map<FileCategory, Map<FileName, SubmissionFile>>();
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

            // Check for parsing errors in the file entries and validate the submission has unique file names
            const fileEntries = new Map<FileName, SubmissionFile>();
            for (const fileEntryResult of fileEntryResults) {
                if (fileEntryResult.isErr()) return err(fileEntryResult.error);
                const file = fileEntryResult.value;

                if (fileEntries.has(file.name))
                    return err(
                        new Error(
                            `Found duplicate file names for entry ${submissionId} in the ${category} category: ${file.name}.`,
                        ),
                    );
                fileEntries.set(file.name, file);
            }
            categoryMapping.set(category, fileEntries);
        }
        submissionFileMapping.set(submissionId, categoryMapping);
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
