export class ColumnMapping {
    private readonly map: ReadonlyMap<string, string>;
    private readonly displayNames: ReadonlyMap<string, string | undefined>;

    private constructor(map: ReadonlyMap<string, string>, displayNames: ReadonlyMap<string, string | undefined>) {
        this.map = map;
        this.displayNames = displayNames;
    }

    /* Create a new mapping with the given columns, doing a best-effort to pre-match columns. */
    public static fromColumns(sourceColumns: string[], targetColumns: Map<string, string | undefined>) {
        const mapping = new Map<string, string>();
        [...targetColumns.entries()].forEach(([targetColumn, targetColumnDisplayName]) => {
            // TODO improve with fuzzy matching
            if (sourceColumns.includes(targetColumn)) {
                mapping.set(targetColumn, targetColumn);
                // TODO improve with fuzzy matching
            } else if (targetColumnDisplayName !== undefined && sourceColumns.includes(targetColumnDisplayName)) {
                mapping.set(targetColumn, targetColumnDisplayName);
            } else {
                mapping.set(targetColumn, sourceColumns[0]);
            }
        });
        return new ColumnMapping(mapping, targetColumns);
    }

    /* Update the mapping with new source and target columns, trying to keep as much of the 
       mapping intact as possible. */
    public update(newSourceColumns: string[], newTargetColumns: Map<string, string | undefined>): ColumnMapping {
        const newMapping = new Map<string, string>();
        [...newTargetColumns.entries()].forEach(([targetColumn, _targetColumnDisplayName]) => {
            const prevSourceCol = this.map.get(targetColumn);
            if (prevSourceCol && newSourceColumns.includes(prevSourceCol)) {
                newMapping.set(targetColumn, prevSourceCol);
            } else {
                // TODO improve this
                newMapping.set(targetColumn, newSourceColumns[0]);
            }
        });
        return new ColumnMapping(newMapping, newTargetColumns);
    }

    public entries(): [string, string | undefined, string][] {
        return Array.from(this.map.entries()).map(([targetCol, sourceCol]) => [
            targetCol,
            this.displayNames.get(targetCol),
            sourceCol,
        ]);
    }

    public updateWith(k: string, v: string): ColumnMapping {
        const newMapping = new Map(this.map);
        newMapping.set(k, v);
        return new ColumnMapping(newMapping, this.displayNames);
    }

    /* Apply this mapping to a TSV file, returning a new file with remapped columns. */
    public async applyTo(tsvFile: File): Promise<File> {
        const text = await tsvFile.text();
        const inputRows = text.split('\n');
        const headersInFile = inputRows.splice(0, 1)[0].split('\t');
        const headers: string[] = [];
        const indicies: number[] = [];
        this.entries().forEach(([k, v]) => {
            headers.push(k);
            indicies.push(headersInFile.findIndex((s) => s === v));
        });
        const newRows = inputRows.map((r) => r.split('\t')).map((row) => indicies.map((i) => row[i]));
        const newFileContent = [headers, ...newRows].map((row) => row.join('\t')).join('\n');
        return new File([newFileContent], 'remapped.tsv');
    }
}
