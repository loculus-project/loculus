import type { TableDataEntry } from './types.ts';
import type { Header } from '../../types/config.ts';

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
                    label: entry.label,
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

export function getDataTableData(listTableDataEntries: TableDataEntry[], detailsPageHeader?: Header[]): DataTableData {
    const result: DataTableData = {
        topmatter: {
            authors: undefined,
            sequenceDisplayName: undefined,
        },
        table: [],
    };

    const listTableDataEntriesAfterGrouping = grouping(listTableDataEntries);

    const tableHeaderMap = new Map<string, TableDataEntry[]>();
    for (const entry of listTableDataEntriesAfterGrouping) {
        // Move the first entry with type authors to the topmatter
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

        if (entry.type.kind === 'metadata' && entry.name.startsWith('length') && entry.value === 0) {
            continue;
        }

        if (!tableHeaderMap.has(entry.header)) {
            tableHeaderMap.set(entry.header, []);
        }
        tableHeaderMap.get(entry.header)!.push(entry);
    }

    const headerGroups: { header: string; rows: TableDataEntry[] }[] = [];
    for (const [header, rows] of tableHeaderMap.entries()) {
        rows.sort(
            (a, b) =>
                (a.orderOnDetailsPage ?? Number.POSITIVE_INFINITY) - (b.orderOnDetailsPage ?? Number.POSITIVE_INFINITY),
        );
        headerGroups.push({ header, rows });
    }

    headerGroups.sort((a, b) => {
        const aOrder = detailsPageHeader?.find((h) => h.name === a.header)?.order ?? Number.POSITIVE_INFINITY;
        const bOrder = detailsPageHeader?.find((h) => h.name === b.header)?.order ?? Number.POSITIVE_INFINITY;
        return aOrder - bOrder;
    });

    result.table = headerGroups.map(({ header, rows }) => ({ header, rows }));

    return result;
}
