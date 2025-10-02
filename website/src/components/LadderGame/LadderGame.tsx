import type { DragEvent, FC } from 'react';
import { useMemo, useRef, useState } from 'react';

import type { LadderItem } from './ladderGameUtils';
import { getSerpentineRows, reorderSerpentine, serpentineIndexForDisplayPosition } from './ladderGameUtils';

const COLUMNS = 4;

const LADDER_ITEMS: LadderItem[] = [
    { id: '1', label: '1', solved: true },
    { id: '2', label: '2', solved: true },
    { id: '3', label: '3', solved: true },
    { id: '4', label: '4', solved: true },
    { id: '5', label: '5', solved: false },
    { id: '6', label: '6', solved: false },
    { id: '7', label: '7', solved: false },
    { id: '8', label: '8', solved: false },
    { id: '9', label: '9', solved: false },
    { id: '10', label: '10', solved: false },
    { id: '11', label: '11', solved: false },
    { id: '12', label: '12', solved: false },
];

const INITIAL_ORDER: string[] = ['1', '2', '3', '4', '8', '7', '6', '5', '9', '10', '12', '11'];

const itemMap: Record<string, LadderItem> = LADDER_ITEMS.reduce<Record<string, LadderItem>>((acc, item) => {
    acc[item.id] = item;
    return acc;
}, {});

const classNames = (...values: (string | undefined | null | false)[]) => values.filter(Boolean).join(' ');

const LadderGame: FC = () => {
    const [draftModeEnabled, setDraftModeEnabled] = useState<boolean>(false);
    const [order, setOrder] = useState<string[]>(INITIAL_ORDER);
    const draggedItemId = useRef<string | null>(null);

    const rows = useMemo(() => getSerpentineRows(order, COLUMNS), [order]);

    const handleToggleDraftMode = () => {
        setDraftModeEnabled((current) => {
            if (current) {
                draggedItemId.current = null;
            }
            return !current;
        });
    };

    const handleDragStart = (id: string, event: DragEvent<HTMLDivElement>) => {
        if (!draftModeEnabled) {
            event.preventDefault();
            return;
        }

        draggedItemId.current = id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
    };

    const handleDragEnd = () => {
        draggedItemId.current = null;
    };

    const handleDragOver = (event: DragEvent<HTMLDivElement>, serpentineIndex: number) => {
        if (!draftModeEnabled) {
            return;
        }

        const occupantId = order[serpentineIndex];
        const occupant = occupantId ? itemMap[occupantId] : undefined;
        if (occupantId && occupantId !== draggedItemId.current && occupant && occupant.solved) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>, serpentineIndex: number) => {
        if (!draftModeEnabled) {
            return;
        }

        event.preventDefault();
        const itemId = draggedItemId.current ?? event.dataTransfer.getData('text/plain');

        if (!itemId) {
            return;
        }

        const fromIndex = order.indexOf(itemId);
        if (fromIndex === -1) {
            return;
        }

        const occupantId = order[serpentineIndex];
        const occupant = occupantId ? itemMap[occupantId] : undefined;
        if (occupantId && occupantId !== itemId && occupant && occupant.solved) {
            return;
        }

        setOrder((currentOrder) => reorderSerpentine(currentOrder, fromIndex, serpentineIndex));
    };

    return (
        <div className='space-y-4'>
            <label className='inline-flex items-center gap-2 text-sm font-medium text-slate-800'>
                <input
                    type='checkbox'
                    checked={draftModeEnabled}
                    onChange={handleToggleDraftMode}
                    className='size-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500'
                />
                Enable draft mode
            </label>

            <div
                className='grid gap-2'
                style={{
                    gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))`,
                }}
            >
                {rows.map((row, rowIndex) =>
                    row.map((cellItemId, columnIndex) => {
                        const serpentineIndex = serpentineIndexForDisplayPosition(rowIndex, columnIndex, COLUMNS);
                        const item = itemMap[cellItemId];

                        const isDraggable = draftModeEnabled && !item.solved;
                        const disabled = item.solved;

                        return (
                            <div
                                key={`${rowIndex}-${columnIndex}`}
                                data-serpentine-index={serpentineIndex}
                                onDragOver={(event) => handleDragOver(event, serpentineIndex)}
                                onDrop={(event) => handleDrop(event, serpentineIndex)}
                                className={classNames(
                                    'relative flex h-20 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 transition-colors',
                                    disabled ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-700',
                                )}
                            >
                                <div
                                    draggable={isDraggable}
                                    onDragStart={(event) => handleDragStart(cellItemId, event)}
                                    onDragEnd={handleDragEnd}
                                    className={classNames(
                                        'flex size-16 items-center justify-center rounded-md border border-slate-300 bg-white text-lg font-semibold shadow-sm transition-transform',
                                        isDraggable
                                            ? 'cursor-grab active:cursor-grabbing'
                                            : 'cursor-not-allowed opacity-60',
                                    )}
                                >
                                    {item.label}
                                </div>
                            </div>
                        );
                    }),
                )}
            </div>
        </div>
    );
};

export default LadderGame;
