export type LadderItem = {
    id: string;
    label: string;
    solved: boolean;
};

export type LadderState = {
    order: string[];
    items: Record<string, LadderItem>;
    columns: number;
};

export const reorderSerpentine = (order: string[], fromIndex: number, toIndex: number): string[] => {
    if (fromIndex === toIndex) {
        return order;
    }

    const nextOrder = [...order];
    const [removed] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, removed);
    return nextOrder;
};

export const getSerpentineRows = (order: string[], columns: number): string[][] => {
    if (columns <= 0) {
        return [];
    }

    const rows: string[][] = [];
    const rowCount = Math.ceil(order.length / columns);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const rowStart = rowIndex * columns;
        const rowSlice = order.slice(rowStart, rowStart + columns);

        if (rowIndex % 2 === 1) {
            rows.push([...rowSlice].reverse());
        } else {
            rows.push(rowSlice);
        }
    }

    return rows;
};

export const serpentineIndexForDisplayPosition = (rowIndex: number, columnIndex: number, columns: number): number => {
    const baseIndex = rowIndex * columns;
    if (rowIndex % 2 === 1) {
        return baseIndex + (columns - 1 - columnIndex);
    }

    return baseIndex + columnIndex;
};
