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

    const headerGroups: { header: string; rows: TableDataEntry[]; meanOrder: number }[] = [];
    for (const [header, rows] of tableHeaderMap.entries()) {
        rows.sort(
            (a, b) =>
                (a.orderOnDetailsPage ?? Number.POSITIVE_INFINITY) - (b.orderOnDetailsPage ?? Number.POSITIVE_INFINITY),
        );

        // Combine length and completeness entries
        let combinedRows = combineAlignmentLengthAndCompleteness(rows);
        // Combine host fields
        combinedRows = combineHostFields(combinedRows);

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
            // Look for a corresponding completeness entry
            const completenessIndex = rows.findIndex(
                (row, idx) =>
                    idx > i &&
                    row.name.includes('completeness') &&
                    row.header === currentRow.header
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

function combineHostFields(rows: TableDataEntry[]): TableDataEntry[] {
    const result: TableDataEntry[] = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < rows.length; i++) {
        if (processedIndices.has(i)) {
            continue;
        }

        const currentRow = rows[i];
        const isHostTaxonId = currentRow.name === 'hostTaxonId';

        if (isHostTaxonId) {
            const hostTaxonId = currentRow.value.toString();
            
            // Look for hostNameScientific and hostNameCommon entries
            const hostNameScientificIndex = rows.findIndex(
                (row, idx) =>
                    idx > i &&
                    row.name === 'hostNameScientific' &&
                    row.header === currentRow.header
            );

            const hostNameCommonIndex = rows.findIndex(
                (row, idx) =>
                    idx > i &&
                    row.name === 'hostNameCommon' &&
                    row.header === currentRow.header
            );

            const hostNameScientific = hostNameScientificIndex !== -1 ? rows[hostNameScientificIndex].value.toString() : undefined;
            const hostNameCommon = hostNameCommonIndex !== -1 ? rows[hostNameCommonIndex].value.toString() : undefined;

            let displayValue: string;
            
            if (hostNameCommon && hostNameScientific) {
                displayValue = `${hostNameCommon} (${hostNameScientific})`;
            } else if (hostNameCommon) {
                displayValue = hostNameCommon;
            } else if (hostNameScientific) {
                displayValue = hostNameScientific;
            } else {
                displayValue = hostTaxonId;
            }

            const ncbiUrl = `https://www.ncbi.nlm.nih.gov/taxonomy/${hostTaxonId}`;

            result.push({
                ...currentRow,
                label: 'Host species',
                value: displayValue,
                customDisplay: {
                    type: 'link',
                    url: ncbiUrl,
                },
            });

            if (hostNameScientificIndex !== -1) {
                processedIndices.add(hostNameScientificIndex);
            }
            if (hostNameCommonIndex !== -1) {
                processedIndices.add(hostNameCommonIndex);
            }
        } else if (currentRow.name !== 'hostNameScientific' && currentRow.name !== 'hostNameCommon') {
            result.push(currentRow);
        }

        processedIndices.add(i);
    }

    return result;
}
