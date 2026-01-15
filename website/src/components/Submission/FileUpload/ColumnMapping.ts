import Papa from 'papaparse';

import { type ProcessedFile } from './fileProcessing';
import type { InputField } from '../../../types/config';
import stringSimilarity from '../../../utils/stringSimilarity';

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
        this.entries().forEach(([sourceCol, targetCol]) => {
            if (targetCol === null) return;
            headers.push(targetCol);
            indices.push(headersInFile.findIndex((sourceHeader) => sourceHeader === sourceCol));
        });
        const newRows = inputRows.map((row) => indices.map((i) => row[i]));
        const newFileContent = Papa.unparse([headers, ...newRows], { delimiter: '\t', newline: '\n' });
        return new File([newFileContent], 'remapped.tsv');
    }

    public equals(other: ColumnMapping | null): boolean {
        if (other === null) {
            return false;
        }
        const mapsAreEqual = <K, V>(m1: ReadonlyMap<K, V>, m2: ReadonlyMap<K, V>) =>
            m1.size === m2.size && Array.from(m1.keys()).every((key) => m1.get(key) === m2.get(key));

        return mapsAreEqual(this.map, other.map);
    }
}
