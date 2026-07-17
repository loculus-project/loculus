import { type Result, ok, err } from 'neverthrow';
import Papa from 'papaparse';

import { type ProcessedFile } from './fileProcessing';
import { SUBMISSION_ID_INPUT_FIELD } from '../../../settings';
import type { InputField } from '../../../types/config';
import stringSimilarity from '../../../utils/stringSimilarity';

// File columns begin with the 'files.' prefix.
// File entries are space-separated and can have one of the following forms: name, name::path, name::path:fileId
const FILES_HEADER_PREFIX = 'files.';
export const FILE_ENTRY_SEPARATOR = ' ';
const FILE_ENTRY_REGEX = /^([^:]+)(?:::([^:]+))?(?::([^:]+))?$/; // TODO: Add name:fileId

type SubmissionId = string;
export type SubmissionFile = {
    name: string;
    path: string;
    fileId?: string;
};
type Category = string;
type FilePath = string;
export type FileMapping = Map<Category, Map<FilePath, SubmissionFile>>;
export type SubmissionFileMapping = Map<SubmissionId, FileMapping>;

export class ColumnMapping {
    private constructor(private readonly map: ReadonlyMap<string, string | null>) {}

    private static getBestMatchingTargetColumn(sourceColumn: string, inputFields: InputField[]): string | null {
        if (inputFields.length === 0) return null;
        const [bestMatch, score] = inputFields
            .map((field): [string, number] => {
                const score = Math.max(
                    stringSimilarity(sourceColumn, field.name),
                    stringSimilarity(sourceColumn, field.displayName ?? ''),
                );
                return [field.name, score];
            })
            .reduce((maxItem, currentItem) => (currentItem[1] > maxItem[1] ? currentItem : maxItem));
        return score > 0.8 ? bestMatch : null;
    }

    /* Create a new mapping with the given columns, doing a best-effort to pre-match columns. */
    public static fromColumns(sourceColumns: string[], inputFields: InputField[]) {
        const mapping = new Map();
        let availableFields = inputFields;
        let remainingSourceColumns = sourceColumns;
        // set them all to null to keep order
        sourceColumns.forEach((sourceColumn) => mapping.set(sourceColumn, null));
        // assign exact matches first
        sourceColumns.forEach((sourceColumn) => {
            const foundField = availableFields.find(
                (inputField) => inputField.name === sourceColumn || inputField.displayName === sourceColumn,
            );
            if (foundField) {
                mapping.set(sourceColumn, foundField.name);
                availableFields = availableFields.filter((f) => f.name !== sourceColumn);
                remainingSourceColumns = remainingSourceColumns.filter((f) => f !== sourceColumn);
            }
        });
        // special case: automatically map 'submissionId' to 'id'
        if (remainingSourceColumns.includes('submissionId') && availableFields.find((f) => f.name === 'id')) {
            mapping.set('submissionId', 'id');
            availableFields = availableFields.filter((f) => f.name !== 'id');
            remainingSourceColumns = remainingSourceColumns.filter((f) => f !== 'submissionId');
        }
        // do best effort matching second
        remainingSourceColumns.forEach((sourceColumn) => {
            const bestMatch = this.getBestMatchingTargetColumn(sourceColumn, availableFields);
            mapping.set(sourceColumn, bestMatch);
            availableFields = availableFields.filter((field) => field.name !== bestMatch);
        });
        return new ColumnMapping(mapping);
    }

    /* Update the mapping with new source and target columns, keeping previously mapped values. */
    public update(newSourceColumns: string[], newInputFields: InputField[]): ColumnMapping {
        // keep entries that existed before
        const newMapping = new Map(
            newSourceColumns.map((newSourceCol) => {
                const prevTargetCol = this.map.get(newSourceCol);
                if (prevTargetCol && newInputFields.map((f) => f.name).includes(prevTargetCol)) {
                    return [newSourceCol, prevTargetCol];
                } else {
                    return [newSourceCol, null];
                }
            }),
        );
        return new ColumnMapping(newMapping);
    }

    /* Returns the entries in the mapping as a list. Each item in the list has:
     * - The source column name
     * - The target column name
     */
    public entries(): [string, string | null][] {
        return Array.from(this.map.entries());
    }

    public usedColumns(): string[] {
        return Array.from(this.map.values()).filter((v): v is string => v !== null);
    }

    public updateWith(sourceColumn: string, targetColumn: string | null): ColumnMapping {
        const newMapping = new Map(this.map);
        newMapping.set(sourceColumn, targetColumn);
        this.map.forEach((targetCol, srcCol) => targetCol === targetColumn && newMapping.set(srcCol, null));
        return new ColumnMapping(newMapping);
    }

    /* Apply this mapping to a TSV file, returning a new file with remapped columns. */
    public async applyTo(tsvFile: ProcessedFile): Promise<File> {
        const text = await tsvFile.text();
        const parsed = Papa.parse<string[]>(text, { delimiter: '\t', skipEmptyLines: true });
        const inputRows: string[][] = parsed.data;
        const headersInFile = inputRows.splice(0, 1)[0];
        const headers: string[] = [];
        const indices: number[] = [];
        const mappedSourceColumns = new Set<string>();
        this.entries().forEach(([sourceCol, targetCol]) => {
            if (targetCol === null) return;
            mappedSourceColumns.add(sourceCol);
            headers.push(targetCol);
            indices.push(headersInFile.findIndex((sourceHeader) => sourceHeader === sourceCol));
        });

        // Include file category columns, as these will not be present in the column mapping
        headersInFile.forEach((sourceHeader, sourceIndex) => {
            if (sourceHeader.startsWith(FILES_HEADER_PREFIX) && !mappedSourceColumns.has(sourceHeader)) {
                headers.push(sourceHeader);
                indices.push(sourceIndex);
            }
        });
        const newRows = inputRows.map((row) => indices.map((i) => row[i]));
        const newFileContent = Papa.unparse([headers, ...newRows], { delimiter: '\t', newline: '\n' });
        return new File([newFileContent], 'remapped.tsv');
    }

    public equals(other: ColumnMapping | null): boolean {
        if (other === null) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapsAreEqual = (m1: ReadonlyMap<any, any>, m2: ReadonlyMap<any, any>) =>
            m1.size === m2.size && Array.from(m1.keys()).every((key) => m1.get(key) === m2.get(key));

        return mapsAreEqual(this.map, other.map);
    }
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

export const parseFileMappingFromSubmission = (text: string): Result<SubmissionFileMapping, Error> => {
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
                new Error('Found duplicate id value within metadata file. Please ensure all rows contain unique ids.'),
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
};
