import type { TableDataEntry } from './types.ts';

export type DataTableData = {
    topmatter: {
        authors: string[] | undefined;
        displayName: string | undefined;
    };
    table: {
        header: string;
        rows: TableDataEntry[];
    }[];
};

export function getDataTableData(listTableDataEntries: TableDataEntry[]): DataTableData {
    const result: DataTableData = {
        topmatter: {
            authors: undefined,
            displayName: undefined,
        },
        table: [],
    };

    const tableHeaderMap = new Map<string, TableDataEntry[]>();
    for (const entry of listTableDataEntries) {
        // Move the first entry with type authors to the topmatter
        if (
            result.topmatter.authors === undefined &&
            entry.type.kind === 'metadata' &&
            entry.type.metadataType === 'authors'
        ) {
            result.topmatter.authors = entry.value
                .toString()
                .split(',')
                .map((x) => x.trim());
            continue;
        }

        if (
            result.topmatter.displayName === undefined &&
            entry.type.kind === 'metadata' &&
            entry.name === 'display_name'
        ) {
            result.topmatter.displayName = entry.value.toString();
            continue;
        }

        if (!tableHeaderMap.has(entry.header)) {
            tableHeaderMap.set(entry.header, []);
        }
        tableHeaderMap.get(entry.header)!.push(entry);
    }
    for (const [header, rows] of tableHeaderMap.entries()) {
        result.table.push({ header, rows });
    }

    return result;
}
