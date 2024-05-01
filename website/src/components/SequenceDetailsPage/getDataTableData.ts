import type { TableDataEntry } from './getTableData.ts';

type DataTableData = {
    topmatter: {
        authors: string[] | undefined,
    }
    table: {
        header: string;
        rows: TableDataEntry[]
    }[]
}

export function getDataTableData(listTableDataEntries: TableDataEntry[]): DataTableData {
    const result: DataTableData = {
        topmatter: {
            authors: undefined,
        },
        table: []
    }

    const tableHeaderMap = new Map<string, TableDataEntry[]>()
    for (let entry of listTableDataEntries) {
        // Move the first entry with type authors to the topmatter
        if (result.topmatter.authors === undefined && entry.type.name === 'metadata' && entry.type.type === 'authors') {
            result.topmatter.authors = entry.value.toString().split(',').map(x => x.trim());
            break;
        }

        if (!tableHeaderMap.has(entry.header)) {
            tableHeaderMap.set(entry.header, []);
        }
        tableHeaderMap.get(entry.header)!.push(entry);
    }
    for (let [header, rows] of tableHeaderMap.entries()) {
        result.table.push({ header, rows });
    }

    return result;
}