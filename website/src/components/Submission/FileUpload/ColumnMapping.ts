import { type ProcessedFile } from './fileProcessing';
import type { InputField } from '../../../types/config';
import stringSimilarity from '../../../utils/stringSimilarity';

export class ColumnMapping {
    private constructor(private readonly map: ReadonlyMap<string, string | null>) {}

    private static getBestMatchingTargetColumn(sourceColumn: string, inputFields: InputField[]): string | null {
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
        sourceColumns.forEach((sourceColumn) => {
            const bestMatch = this.getBestMatchingTargetColumn(sourceColumn, availableFields);
            mapping.set(sourceColumn, bestMatch);
            availableFields = availableFields.filter((field) => field.name !== bestMatch);
        });
        return new ColumnMapping(mapping);
    }

    /* Update the mapping with new source and target columns, trying to keep as much of the 
       mapping intact as possible. */
    public update(newSourceColumns: string[], inputFields: InputField[]): ColumnMapping {
        const newMapping = new Map(
            newSourceColumns.map((newSourceCol) => {
                const prevTargetCol = this.map.get(newSourceCol);
                if (prevTargetCol && inputFields.map((f) => f.name).includes(prevTargetCol)) {
                    return [newSourceCol, prevTargetCol];
                } else {
                    return [newSourceCol, ColumnMapping.getBestMatchingTargetColumn(newSourceCol, inputFields)];
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
        const inputRows = text.trim().split('\n');
        const headersInFile = inputRows.splice(0, 1)[0].split('\t');
        const headers: string[] = [];
        const indicies: number[] = [];
        this.entries().forEach(([sourceCol, targetCol]) => {
            if (targetCol === null) return;
            headers.push(targetCol);
            indicies.push(headersInFile.findIndex((sourceHeader) => sourceHeader === sourceCol));
        });
        const newRows = inputRows.map((rawRow) => rawRow.split('\t')).map((row) => indicies.map((i) => row[i]));
        const newFileContent = [headers, ...newRows].map((row) => row.join('\t').concat('\n')).join('');
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
