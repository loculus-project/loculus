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

type DeclaredFile = {
    type: 'declaredFile';
    name: string;
    path: string;
};

type ReusedFile = {
    type: 'reusedFile';
    name: string;
    fileId: string;
};

/*
 * A submission file in the metadata.
 * Submission files can be either declared or reused.
 */
export type SubmissionFile = DeclaredFile | ReusedFile;

/*
 * A file uploaded by the folder upload component.
 * Uploaded files must have their folder upload path as well as a file ID for the uploaded file.
 */
type UploadedFile = {
    type: 'uploadedFile';
    path: string;
    fileId: string;
};

/*
 * A declared file linked with an uploaded file.
 */
type LinkedFile = {
    type: 'linkedFile';
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
    file: LinkedFile | ReusedFile;
};

/**
 * A linked or reused file with name and file ID, ready for submission.
 */
type ResolvedFile = {
    type: 'resolvedFile';
    name: string;
    fileId: string;
};

/**
 * Files uploaded via the folder upload component, keyed by path. Paths are unique within an upload.
 * Every uploaded file has a file ID.
 */
export type FileMapping = Map<FileCategory, Map<FilePath, FileId>>;

/**
 * Files declared per submission in the metadata, keyed by name.
 */
export type SubmissionFileMapping<T = SubmissionFile> = Map<SubmissionId, Map<FileCategory, Map<FileName, T>>>;

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
    [LinkageType.LINKED]: LinkedFile[];
    [LinkageType.REUSED]: ReusedFile[];
    [LinkageType.MISSING]: DeclaredFile[];
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
function getResolvedFileMapping(entries: ResolvedEntry[]): SubmissionFileMapping<ResolvedFile> {
    const mapping: SubmissionFileMapping<ResolvedFile> = new Map();

    for (const { submissionId, category, file } of entries) {
        const categoryMapping: Map<FileCategory, Map<FileName, ResolvedFile>> = mapping.get(submissionId) ?? new Map();
        const files: Map<FileName, ResolvedFile> = categoryMapping.get(category) ?? new Map();

        files.set(file.name, { type: 'resolvedFile', name: file.name, fileId: file.fileId });

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
    submissionFileMapping: SubmissionFileMapping<ResolvedFile>;
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

        const linkedPaths = new Set<FilePath>();
        const shadowedPaths = new Set<FilePath>();

        for (const [submissionId, categoryMapping] of submissionFileMapping) {
            const files = categoryMapping.get(category);
            if (files === undefined) continue;

            for (const file of files.values()) {
                switch (file.type) {
                    case 'declaredFile': {
                        const uploadFileId = uploads?.get(file.path);

                        if (uploadFileId !== undefined) {
                            const linkedFile: LinkedFile = {
                                type: 'linkedFile',
                                name: file.name,
                                path: file.path,
                                fileId: uploadFileId,
                            };

                            categoryLinkage.linked.push(linkedFile);
                            linkedPaths.add(file.path);
                            resolvedEntries.push({ submissionId, category, file: linkedFile });
                        } else categoryLinkage.missing.push(file);
                        break;
                    }
                    case 'reusedFile': {
                        categoryLinkage.reused.push(file);
                        shadowedPaths.add(file.name);
                        resolvedEntries.push({ submissionId, category, file });
                        break;
                    }
                }
            }
        }

        if (uploads !== undefined) {
            for (const [path, fileId] of uploads) {
                if (linkedPaths.has(path)) continue;
                else if (shadowedPaths.has(path)) categoryLinkage.shadowed.push({ type: 'uploadedFile', path, fileId });
                else categoryLinkage.orphaned.push({ type: 'uploadedFile', path, fileId });
            }
        }
        fileLinkage.set(category, categoryLinkage);
    }

    const mapping = getResolvedFileMapping(resolvedEntries);
    return { submissionFileMapping: mapping, fileLinkage };
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
export function getSingleSubmissionFileMapping(
    submissionId: SubmissionId,
    fileMapping: FileMapping,
): SubmissionFileMapping<ResolvedFile> {
    return new Map([
        [
            submissionId,
            new Map(
                [...fileMapping].map(([category, files]) => [
                    category,
                    new Map([...files].map(([path, fileId]) => [path, { type: 'resolvedFile', name: path, fileId }])),
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
function parseMetadataFileEntry(entry: string): Result<SubmissionFile, Error> {
    const match = FILE_ENTRY_REGEX.exec(entry.trim());
    if (!match)
        return err(
            new Error(
                `Failed to parse file entry. Please ensure all file entries are one of: ${FILE_ENTRY_FORMS.join(', ')}.`,
            ),
        );
    const [, name, path, fileId] = match;

    if (!fileId) {
        return ok({ type: 'declaredFile', name, path: !path ? name : path });
    } else {
        return ok({ type: 'reusedFile', name, fileId });
    }
}

type MetadataColumn = { name: string; index: number };
type FileColumn = MetadataColumn & { category: FileCategory };
type ParsedMetadata = { columns: MetadataColumn[]; rows: string[][] };

/**
 * Returns the file columns of the metadata file.
 * @param columns The columns of the metadata file.
 * @returns The file columns, each with their file category.
 */
const getFileColumns = (columns: MetadataColumn[]): FileColumn[] =>
    columns
        .filter((column) => column.name.startsWith(FILES_HEADER_PREFIX))
        .map((column) => ({
            name: column.name,
            index: column.index,
            category: column.name.slice(FILES_HEADER_PREFIX.length),
        }));

/**
 * Returns the first ID column of the metadata file.
 * @param columns The columns of the metadata file.
 * @returns The first ID column, or an error if this is not found.
 */
const getIdColumn = (columns: MetadataColumn[]): Result<MetadataColumn, Error> => {
    const idColumn = columns.find(({ name }) => ID_COLUMNS.includes(name));

    if (idColumn === undefined)
        return err(new Error('Missing id column. Please ensure this is included in the uploaded metadata file.'));

    return ok(idColumn);
};

/**
 * Parses the TSV text of a metadata file into its columns and rows.
 * @param text The text of the metadata file.
 * @returns The columns and the rows, or an error if the file is empty.
 */
const parseMetadataText = (text: string): Result<ParsedMetadata, Error> => {
    const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
    if (parsed.data.length === 0) return err(new Error('Please provide a non-empty metadata file.'));

    const columns = parsed.data[0].map((column, index) => ({ name: column, index }));
    const rows = parsed.data.slice(1);

    return ok({ columns, rows });
};

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
    const parsedMetadataResult = parseMetadataText(text);
    if (parsedMetadataResult.isErr()) return err(parsedMetadataResult.error);
    const { columns, rows } = parsedMetadataResult.value;

    // Get file columns from the metadata
    const fileColumns = getFileColumns(columns);
    if (fileColumns.length === 0) return ok(new Map());

    // Validate file categories declared in the metadata
    const fileCategories = fileColumns.map((column) => column.category);
    const unknownCategories = fileCategories.filter((category) => !categories.includes(category));
    if (unknownCategories.length > 0)
        return err(
            new Error(
                `Found unknown file categories within metadata file: ${[...new Set(unknownCategories)].join(', ')}.`,
            ),
        );
    const duplicateCategories = fileCategories.filter((category, index) => fileCategories.indexOf(category) !== index);
    if (duplicateCategories.length > 0)
        return err(
            new Error(
                `Found duplicate file categories within metadata file: ${[...new Set(duplicateCategories)].join(', ')}.`,
            ),
        );

    // Get ID column from the metadata
    const idColumnResult = getIdColumn(columns);
    if (idColumnResult.isErr()) return err(idColumnResult.error);
    const idColumn = idColumnResult.value;

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
        for (const column of fileColumns) {
            // Skip empty cells
            const cell = row[column.index] ?? '';
            if (cell.trim() === '') continue;

            // Parse each file entry in the cell
            const fileEntryResults = cell
                .split(FILES_SEPARATOR)
                .map((entry) => entry.trim())
                .filter((entry) => entry !== '')
                .map((entry) => parseMetadataFileEntry(entry));

            // Check for parsing errors in the file entries and validate the submission has unique file names
            const fileEntries = new Map<FileName, SubmissionFile>();
            for (const fileEntryResult of fileEntryResults) {
                if (fileEntryResult.isErr()) return err(fileEntryResult.error);
                const file = fileEntryResult.value;

                if (fileEntries.has(file.name))
                    return err(
                        new Error(
                            `Found duplicate file names for entry ${submissionId} in the ${column.category} category: ${file.name}.`,
                        ),
                    );
                fileEntries.set(file.name, file);
            }
            categoryMapping.set(column.category, fileEntries);
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
    resolvedSubmissionFileMapping: SubmissionFileMapping<ResolvedFile>,
): Promise<Result<File, Error>> {
    // If there are no resolved file entries, return the original file
    if (resolvedSubmissionFileMapping.size === 0) return ok(metadataFile);

    const text = await metadataFile.text();

    const parsedMetadataResult = parseMetadataText(text);
    if (parsedMetadataResult.isErr()) return err(parsedMetadataResult.error);
    const { columns, rows } = parsedMetadataResult.value;

    // Get file columns from the metadata
    const fileColumns = getFileColumns(columns);

    // Validate a column exists for every category in the resolved mapping
    const missingCategory = [...resolvedSubmissionFileMapping.values()]
        .flatMap((fileMapping) => [...fileMapping.keys()])
        .find((category) => !fileColumns.some((column) => column.category === category));

    if (missingCategory !== undefined)
        return err(new Error(`Encountered unknown category ${missingCategory} not present in metadata.`));

    // Get ID column from the metadata
    const idColumnResult = getIdColumn(columns);
    if (idColumnResult.isErr()) return err(idColumnResult.error);
    const idColumn = idColumnResult.value;

    // Update the rows with file columns containing resolved file entries
    const updatedRows = rows.map((row) => {
        const submissionId = row[idColumn.index] ?? '';
        const fileMapping = resolvedSubmissionFileMapping.get(submissionId);
        if (fileMapping === undefined) return row;

        const updatedRow = [...row];
        for (const column of fileColumns) {
            const files = fileMapping.get(column.category);
            if (files === undefined) continue;

            updatedRow[column.index] = [...files.values()]
                .map((file) => `${file.name}${FILE_NAME_ID_SEPARATOR}${file.fileId}`)
                .join(FILES_SEPARATOR);
        }
        return updatedRow;
    });

    const header = columns.map(({ name }) => name);
    const content = Papa.unparse([header, ...updatedRows], { delimiter: '\t', newline: '\n' });
    return ok(new File([content], 'metadata.tsv', { type: 'text/tab-separated-values' }));
}
