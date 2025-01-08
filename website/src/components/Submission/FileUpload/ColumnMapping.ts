import { stringSimilarity } from 'string-similarity-js';

import { type ProcessedFile } from './fileProcessing';

export class ColumnMapping {
    private readonly map: ReadonlyMap<string, string>;
    private readonly displayNames: ReadonlyMap<string, string | undefined>;

    private constructor(map: ReadonlyMap<string, string>, displayNames: ReadonlyMap<string, string | undefined>) {
        this.map = map;
        this.displayNames = displayNames;
    }

    private static getBestMatchingTargetColumn(
        sourceColumn: string,
        targetColumns: ReadonlyMap<string, string | undefined>,
    ): string {
        return Array.from(targetColumns.entries())
            .map(([targetColName, targetColDisplayName]): [string, number] => {
                const score = Math.max(
                    stringSimilarity(sourceColumn, targetColName),
                    stringSimilarity(sourceColumn, targetColDisplayName ?? ''),
                );
                return [targetColName, score];
            })
            .reduce((maxItem, currentItem) => (currentItem[1] > maxItem[1] ? currentItem : maxItem))[0];
    }

    /* Create a new mapping with the given columns, doing a best-effort to pre-match columns. */
    public static fromColumns(sourceColumns: string[], targetColumns: Map<string, string | undefined>) {
        const mapping = new Map(
            sourceColumns.map((sourceColumn) => [
                sourceColumn,
                this.getBestMatchingTargetColumn(sourceColumn, targetColumns),
            ]),
        );
        return new ColumnMapping(mapping, targetColumns);
    }

    /* Update the mapping with new source and target columns, trying to keep as much of the 
       mapping intact as possible. */
    public update(newSourceColumns: string[], newTargetColumns: Map<string, string | undefined>): ColumnMapping {
        const newMapping = new Map(
            newSourceColumns.map(newSourceCol => {
                const prevTargetCol = this.map.get(newSourceCol);
                if (prevTargetCol && Array.from(newTargetColumns.keys()).includes(prevTargetCol)) {
                    return [newSourceCol, prevTargetCol];
                } else {
                    return [newSourceCol, ColumnMapping.getBestMatchingTargetColumn(newSourceCol, newTargetColumns)];
                }
            })
        );
        return new ColumnMapping(newMapping, newTargetColumns);
    }

    /* Returns the entries in the mapping as a list. Each item in the list has:
     * - The source column name
     * - The target column name
     * - The target column display name (optional)
     */
    public entries(): [string, string, string | undefined][] {
        return Array.from(this.map.entries()).map(([sourceCol, targetCol]) => [
            sourceCol,
            targetCol,
            this.displayNames.get(targetCol),
        ]);
    }

    public updateWith(sourceColumn: string, targetColumn: string): ColumnMapping {
        const newMapping = new Map(this.map);
        newMapping.set(sourceColumn, targetColumn);
        return new ColumnMapping(newMapping, this.displayNames);
    }

    /* Apply this mapping to a TSV file, returning a new file with remapped columns. */
    public async applyTo(tsvFile: ProcessedFile): Promise<File> {
        const text = await tsvFile.text();
        const inputRows = text.split('\n');
        const headersInFile = inputRows.splice(0, 1)[0].split('\t');
        const headers: string[] = [];
        const indicies: number[] = [];
        this.entries().forEach(([sourceCol, targetCol, _]) => {
            headers.push(targetCol);
            indicies.push(headersInFile.findIndex((sourceHeader) => sourceHeader === sourceCol));
        });
        const newRows = inputRows.map((rawRow) => rawRow.split('\t')).map((row) => indicies.map((i) => row[i]));
        const newFileContent = [headers, ...newRows].map((row) => row.join('\t')).join('\n');
        return new File([newFileContent], 'remapped.tsv');
    }

    public equals(other: ColumnMapping | null): boolean {
        if (other === null) {
            return false;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapsAreEqual = (m1: ReadonlyMap<any, any>, m2: ReadonlyMap<any, any>) =>
            m1.size === m2.size && Array.from(m1.keys()).every((key) => m1.get(key) === m2.get(key));
        return mapsAreEqual(this.displayNames, other.displayNames) && mapsAreEqual(this.map, other.map);
    }
}
