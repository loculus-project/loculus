import type { TableDataEntry } from './types.ts';

export type DataTableData = {
    topmatter: {
        authors: string[] | undefined;
        sequenceDisplayName: string | undefined;
    };
    table: {
        header: string;
        rows: TableDataEntry[];
    }[];
};

function formatAuthorName(author: string): string {
    const parts = author.split(',').map((x) => x.trim());
    if (parts.length >= 2) {
        return `${parts[1]} ${parts[0]}`.trim();
    }
    return author.trim();
}
function grouping(listTableDataEntries: TableDataEntry[]): TableDataEntry[] {
    const result: TableDataEntry[] = [];
    const groupedEntries = new Map<string, TableDataEntry[]>();

    for (const entry of listTableDataEntries) {
        if (entry.customDisplay?.displayGroup !== undefined) {
            if (!groupedEntries.has(entry.customDisplay.displayGroup)) {
                groupedEntries.set(entry.customDisplay.displayGroup, []);
                // Add a placeholder for the grouped entry
                result.push({
                    name: entry.customDisplay.displayGroup,
                    type: {
                        kind: 'metadata',
                        metadataType: 'string',
                    },
                    value: '[]',
                    header: entry.header,
                    customDisplay: entry.customDisplay,
                    label: entry.customDisplay.label ?? entry.label,
                    orderOnDetailsPage: entry.orderOnDetailsPage,
                });
            }
            groupedEntries.get(entry.customDisplay.displayGroup)!.push(entry);
        } else {
            result.push(entry);
        }
    }

    // Replace placeholders with actual grouped entries
    return result.map((entry) => {
        if (groupedEntries.has(entry.name)) {
            return {
                ...entry,
                value: JSON.stringify(groupedEntries.get(entry.name)),
            };
        }
        return entry;
    });
}

type HasOrder = { orderOnDetailsPage?: number };

export type HeaderGroup<T> = {
    header: string;
    rows: T[];
    meanOrder: number;
};

export function buildHeaderGroups<T extends HasOrder>(
    source: Record<string, T[]> | Map<string, T[]>,
): HeaderGroup<T>[] {
    const headerGroups: HeaderGroup<T>[] = [];

    const entries: Iterable<[string, T[]]> = source instanceof Map ? source.entries() : Object.entries(source);

    for (const [header, rows] of entries) {
        rows.sort(
            (a, b) =>
                (a.orderOnDetailsPage ?? Number.POSITIVE_INFINITY) - (b.orderOnDetailsPage ?? Number.POSITIVE_INFINITY),
        );

        const definedOrders = rows.map((r) => r.orderOnDetailsPage).filter((o): o is number => o !== undefined);

        const meanOrder =
            definedOrders.length > 0
                ? definedOrders.reduce((sum, o) => sum + o, 0) / definedOrders.length
                : Number.POSITIVE_INFINITY;

        headerGroups.push({ header, rows, meanOrder });
    }

    headerGroups.sort((a, b) => a.meanOrder - b.meanOrder);
    return headerGroups;
}

export function getDataTableData(listTableDataEntries: TableDataEntry[]): DataTableData {
    const result: DataTableData = {
        topmatter: {
            authors: undefined,
            sequenceDisplayName: undefined,
        },
        table: [],
    };

    const filteredEntries = listTableDataEntries.filter(
        (entry) =>
            !(entry.type.kind === 'metadata' && entry.value === 0 && entry.header.toLowerCase().includes('alignment')),
    );
    const listTableDataEntriesAfterGrouping = grouping(filteredEntries);

    const tableHeaderMap = new Map<string, TableDataEntry[]>();
    for (const entry of listTableDataEntriesAfterGrouping) {
        if (
            result.topmatter.authors === undefined &&
            entry.type.kind === 'metadata' &&
            entry.type.metadataType === 'authors'
        ) {
            result.topmatter.authors = entry.value
                .toString()
                .split(';')
                .filter((x) => x.trim().length > 0)
                .map(formatAuthorName);
            continue;
        }

        if (
            result.topmatter.sequenceDisplayName === undefined &&
            entry.type.kind === 'metadata' &&
            entry.name === 'displayName'
        ) {
            result.topmatter.sequenceDisplayName = entry.value.toString();
            continue;
        }

        if (!tableHeaderMap.has(entry.header)) {
            tableHeaderMap.set(entry.header, []);
        }
        tableHeaderMap.get(entry.header)!.push(entry);
    }

    const headerGroups = buildHeaderGroups<TableDataEntry>(tableHeaderMap);
    result.table = headerGroups.map(({ header, rows }) => ({ header, rows }));

    return result;
}
