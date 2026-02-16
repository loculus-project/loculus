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

export function getDataTableData(listTableDataEntries: TableDataEntry[]): DataTableData {
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

    const headerGroups: { header: string; rows: TableDataEntry[]; meanOrder: number }[] = [];
    for (const [header, rows] of tableHeaderMap.entries()) {
        rows.sort(
            (a, b) =>
                (a.orderOnDetailsPage ?? Number.POSITIVE_INFINITY) - (b.orderOnDetailsPage ?? Number.POSITIVE_INFINITY),
        );

        let combinedRows = combineAlignmentLengthAndCompleteness(rows);
        combinedRows = suppressEqualCollectionDateBounds(combinedRows);

        const definedOrders = combinedRows.map((r) => r.orderOnDetailsPage).filter((o): o is number => o !== undefined);
        const meanOrder =
            definedOrders.length > 0
                ? definedOrders.reduce((sum, o) => sum + o, 0) / definedOrders.length
                : Number.POSITIVE_INFINITY;
        headerGroups.push({ header, rows: combinedRows, meanOrder });
    }

    headerGroups.sort((a, b) => a.meanOrder - b.meanOrder);
    result.table = headerGroups.map(({ header, rows }) => ({ header, rows }));

    return result;
}

function combineAlignmentLengthAndCompleteness(rows: TableDataEntry[]): TableDataEntry[] {
    const result: TableDataEntry[] = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < rows.length; i++) {
        if (processedIndices.has(i)) {
            continue;
        }

        const currentRow = rows[i];
        const isLengthEntry = currentRow.name.includes('length');

        if (isLengthEntry) {
            const completenessIndex = rows.findIndex(
                (row, idx) => idx > i && row.name.includes('completeness') && row.header === currentRow.header,
            );

            if (completenessIndex !== -1) {
                const completenessRow = rows[completenessIndex];
                const completenessPercent = parseFloat((Number(completenessRow.value) * 100).toPrecision(3));
                const combinedValue = `${currentRow.value} (${completenessPercent}%)`;
                result.push({
                    ...currentRow,
                    value: combinedValue,
                });
                processedIndices.add(completenessIndex);
            } else {
                result.push(currentRow);
            }
        } else if (!currentRow.name.includes('completeness')) {
            result.push(currentRow);
        }

        processedIndices.add(i);
    }

    return result;
}

function suppressEqualCollectionDateBounds(rows: TableDataEntry[]): TableDataEntry[] {
    const lowerBoundIndex = rows.findIndex((row) => row.name === 'sampleCollectionDateRangeLower');
    const upperBoundIndex = rows.findIndex((row) => row.name === 'sampleCollectionDateRangeUpper');
    const collectionDateIndex = rows.findIndex((row) => row.name === 'sampleCollectionDate');

    if (lowerBoundIndex !== -1 && upperBoundIndex !== -1) {
        const lowerValue = rows[lowerBoundIndex].value.toString();
        const upperValue = rows[upperBoundIndex].value.toString();

        if (lowerValue === upperValue) {
            const result = rows.filter((_, index) => index !== lowerBoundIndex && index !== upperBoundIndex);

            if (collectionDateIndex !== -1) {
                const newRows = result.map((row) => {
                    if (row.name === 'sampleCollectionDate') {
                        return {
                            ...row,
                            value: `${row.value} (exact)`,
                        };
                    }
                    return row;
                });
                return newRows;
            }

            return result;
        }
    }

    return rows;
}
