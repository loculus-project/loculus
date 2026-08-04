import { DEFAULT_AA_MUTATION_DETAILS_HEADER, DEFAULT_NUC_MUTATION_DETAILS_HEADER } from '../../types/config';

/**
 * Section rank matching the sequence details page layout (see DataTable.tsx): general
 * sections come first, then the alignment/QC section, then mutation details. Within a
 * rank, the config order from `groupTableDataByHeader` is preserved (stable sort).
 */
export function headerSectionRank(header: string): number {
    if (header === DEFAULT_NUC_MUTATION_DETAILS_HEADER || header === DEFAULT_AA_MUTATION_DETAILS_HEADER) {
        return 2;
    }
    if (header.toLowerCase().includes('alignment')) {
        return 1;
    }
    return 0;
}

/**
 * Groups table data entries by their `header` and orders both the groups and the
 * rows within each group by `orderOnDetailsPage` (the central, config-defined order).
 *
 * Rows within a group are sorted by `orderOnDetailsPage`; groups are sorted by the
 * mean `orderOnDetailsPage` of their rows. Entries without a defined order sort last.
 *
 * Shared between the sequence details page and the version diff view so both present
 * fields in the same, config-driven order.
 */
export function groupTableDataByHeader<T extends { header: string; orderOnDetailsPage?: number }>(
    entries: T[],
): { header: string; rows: T[] }[] {
    const tableHeaderMap = new Map<string, T[]>();
    for (const entry of entries) {
        if (!tableHeaderMap.has(entry.header)) {
            tableHeaderMap.set(entry.header, []);
        }
        tableHeaderMap.get(entry.header)!.push(entry);
    }

    const headerGroups: { header: string; rows: T[]; meanOrder: number }[] = [];
    for (const [header, rows] of tableHeaderMap.entries()) {
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
    return headerGroups.map(({ header, rows }) => ({ header, rows }));
}
