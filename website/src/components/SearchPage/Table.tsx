import { useEffect, useRef, useState } from 'react';
import { capitalCase } from 'change-case';
import { Tooltip } from 'react-tooltip';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiTriangle from '~icons/mdi/triangle';
import MdiTriangleDown from '~icons/mdi/triangle-down';

type Metadatum = {
    name: string;
    displayName?: string;
    truncateColumnDisplayTo?: number;
    type?: string;
    columnWidth?: number;
    order?: number;
};

type Schema = {
    primaryKey: string;
    metadata: Metadatum[];
};

type OrderBy = {
    field: string;
    type: 'ascending' | 'descending';
};

type TableSequenceData = {
    [key: string]: any;
};

function formatField(value: unknown, maxLength: number, type: string): string {
    if (typeof value === 'string' && value.toString().length > maxLength) {
        return `${value.toString().slice(0, maxLength)}…`;
    } else if (typeof value === 'number' && Number.isInteger(value)) {
        if (type === 'timestamp') {
            return new Date(value * 1000).toISOString().slice(0, 10);
        }
        return new Intl.NumberFormat().format(value);
    } else if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    } else {
        return value as string;
    }
}

const getColumnWidthStyle = (columnWidth: number | undefined) =>
    columnWidth !== undefined ? `${columnWidth}px` : '130px';

export const Table = ({
    data,
    schema,
    selectedSeqs,
    setSelectedSeqs,
    setPreviewedSeqId,
    previewedSeqId,
    orderBy,
    setOrderByField,
    setOrderDirection,
    columnsToShow,
}: {
    schema: Schema;
    data: TableSequenceData[];
    selectedSeqs: Set<string>;
    setSelectedSeqs: React.Dispatch<React.SetStateAction<Set<string>>>;
    previewedSeqId: string | null;
    setPreviewedSeqId: (seqId: string | null) => void;
    orderBy: OrderBy;
    setOrderByField: (field: string) => void;
    setOrderDirection: (direction: 'ascending' | 'descending') => void;
    columnsToShow: string[];
}) => {
    const primaryKey = schema.primaryKey;
    const maxLengths = Object.fromEntries(schema.metadata.map((m) => [m.name, m.truncateColumnDisplayTo ?? 100]));

    const columns = columnsToShow
        .map((field) => {
            const metadata = schema.metadata.find((m) => m.name === field);
            return {
                field,
                headerName: metadata?.displayName ?? capitalCase(field),
                maxLength: maxLengths[field],
                type: metadata?.type ?? 'string',
                columnWidth: metadata?.columnWidth,
                order: metadata?.order ?? Number.MAX_SAFE_INTEGER,
            };
        })
        .sort((a, b) => a.order - b.order);

    const handleSort = (field: string) => {
        if (orderBy.field === field) {
            setOrderDirection(orderBy.type === 'ascending' ? 'descending' : 'ascending');
        } else {
            setOrderByField(field);
            setOrderDirection('ascending');
        }
    };

    const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, seqId: string) => {
        const detectMob = () => {
            const toMatch = [/Android/i, /webOS/i, /iPhone/i, /iPod/i, /BlackBerry/i, /Windows Phone/i];
            return toMatch.some((toMatchItem) => navigator.userAgent.match(toMatchItem));
        };

        if (e.button === 0) {
            const screenWidth = window.screen.width;
            if (!e.ctrlKey && !e.metaKey && screenWidth > 1024 && !detectMob()) {
                e.preventDefault();
                setPreviewedSeqId(seqId);
            }
        }
    };

    const setRowSelected = (seqId: string, selected: boolean) => {
        setSelectedSeqs((prevSelectedSeqs) => {
            const newSelectedSeqs = new Set(prevSelectedSeqs);
            if (selected) {
                newSelectedSeqs.add(seqId);
            } else {
                newSelectedSeqs.delete(seqId);
            }
            return newSelectedSeqs;
        });
    };

    const clearSelection = () => setSelectedSeqs(new Set());

    const orderIcon = orderBy.type === 'ascending' ? (
        <MdiTriangle className="w-3 h-3 ml-1 inline" />
    ) : (
        <MdiTriangleDown className="w-3 h-3 ml-1 inline" />
    );

    return (
        <div className="w-full overflow-x-auto text-sm" aria-label="Search Results Table">
            <Tooltip id="table-tip" />
            {data.length !== 0 ? (
                <table className="min-w-full text-left border-collapse">
                    <thead>
                        <tr className="border-gray-400 border-b mb-100">
                            <th className="px-2 py-2 md:pl-6 text-xs text-gray-500 cursor-pointer text-left">
                                {selectedSeqs.size > 0 && (
                                    <MaterialSymbolsClose className="inline w-3 h-3 mx-0.5" onClick={clearSelection} />
                                )}
                            </th>
                            <th
                                onClick={() => handleSort(primaryKey)}
                                className="px-2 py-2 md:pl-6 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer text-left"
                            >
                                {capitalCase(primaryKey)} {orderBy.field === primaryKey && orderIcon}
                            </th>
                            {columns.map((c) => (
                                <th
                                    key={c.field}
                                    onClick={() => handleSort(c.field)}
                                    className="px-2 py-2 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer last:pr-6 text-left"
                                    style={{
                                        minWidth: getColumnWidthStyle(c.columnWidth),
                                    }}
                                >
                                    {c.headerName} {orderBy.field === c.field && orderIcon}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {data.map((row, index) => (
                            <tr
                                key={index}
                                className={`hover:bg-primary-100 border-b border-gray-200 ${
                                    row[primaryKey] === previewedSeqId ? 'bg-gray-200' : ''
                                } cursor-pointer`}
                                onClick={(e) => handleRowClick(e, row[primaryKey] as string)}
                            >
                                <td
                                    className="px-2 whitespace-nowrap text-primary-900 md:pl-6"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const checkbox = e.currentTarget.querySelector(
                                            'input[type="checkbox"]',
                                        ) as HTMLInputElement;
                                        checkbox.checked = !checkbox.checked;
                                        setRowSelected(row[primaryKey] as string, checkbox.checked);
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        className="text-primary-900 hover:text-primary-800 hover:no-underline"
                                        onChange={(e) => setRowSelected(row[primaryKey] as string, e.target.checked)}
                                        onClick={(e) => e.stopPropagation()}
                                        checked={selectedSeqs.has(row[primaryKey] as string)}
                                    />
                                </td>
                                <td className="px-2 whitespace-nowrap text-primary-900 md:pl-6">
                                    {row[primaryKey]}
                                </td>
                                {columns.map((c) => (
                                    <td
                                        key={`${index}-${c.field}`}
                                        className="px-2 py-2 text-primary-900 last:pr-6"
                                        style={{
                                            minWidth: getColumnWidthStyle(c.columnWidth),
                                        }}
                                        data-tooltip-content={
                                            typeof row[c.field] === 'string' &&
                                            row[c.field]!.toString().length > c.maxLength
                                                ? row[c.field]!.toString()
                                                : ''
                                        }
                                        data-tooltip-id="table-tip"
                                    >
                                        {formatField(row[c.field], c.maxLength, c.type)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="flex justify-center font-bold text-xl my-8">No Data</div>
            )}
        </div>
    );
};

export default function LargeComponent() {
    const scrollRef = useRef(null);
    const trackRef = useRef(null);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [maxScroll, setMaxScroll] = useState(0);
    const [handleWidth, setHandleWidth] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [startScrollLeft, setStartScrollLeft] = useState(0);

    useEffect(() => {
        function updateSizes() {
            if (scrollRef.current && trackRef.current) {
                const clientWidth = scrollRef.current.clientWidth;
                const scrollWidth = scrollRef.current.scrollWidth;
                setMaxScroll(scrollWidth - clientWidth);
                const trackWidth = trackRef.current.offsetWidth;
                setHandleWidth((clientWidth / scrollWidth) * trackWidth);
            }
        }
        updateSizes();
        window.addEventListener('resize', updateSizes);
        return () => window.removeEventListener('resize', updateSizes);
    }, []);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollLeft(e.currentTarget.scrollLeft);
    };

    const onMouseDownHandle = (e: React.MouseEvent) => {
        setDragging(true);
        setStartX(e.clientX);
        setStartScrollLeft(scrollLeft);
        e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!dragging) return;
        if (scrollRef.current && trackRef.current) {
            const trackWidth = trackRef.current.offsetWidth;
            const clientWidth = (scrollRef.current as HTMLDivElement).clientWidth;
            const scrollWidth = (scrollRef.current as HTMLDivElement).scrollWidth;
            const maxScrollVal = scrollWidth - clientWidth;
            const deltaX = e.clientX - startX;
            const scrollDelta = (deltaX / (trackWidth - handleWidth)) * maxScrollVal;
            (scrollRef.current as HTMLDivElement).scrollLeft = startScrollLeft + scrollDelta;
        }
    };

    const onMouseUp = () => {
        if (dragging) {
            setDragging(false);
        }
    };

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [dragging, startX, startScrollLeft, handleWidth]);

    let handlePosition = 0;
    if (trackRef.current && maxScroll > 0) {
        const trackWidth = trackRef.current.offsetWidth;
        handlePosition = (scrollLeft / maxScroll) * (trackWidth - handleWidth);
    }

    const sampleData = Array.from({ length: 100 }, (_, i) => ({
        id: `ID${i + 1}`,
        name: `Item ${i + 1}`,
        description: `Description for item ${i + 1}`,
        value: Math.floor(Math.random() * 1000),
        date: new Date(2024, 0, i + 1).getTime() / 1000
    }));

    return (
        <div>
            <div ref={scrollRef} onScroll={handleScroll} className="overflow-x-scroll">
                <Table
                    data={sampleData}
                    schema={{
                        primaryKey: 'id',
                        metadata: [
                            { name: 'id', displayName: 'ID', truncateColumnDisplayTo: 100 },
                            { name: 'name', displayName: 'Name', truncateColumnDisplayTo: 100 },
                            { name: 'description', displayName: 'Description', truncateColumnDisplayTo: 50 },
                            { name: 'value', displayName: 'Value', type: 'number' },
                            { name: 'date', displayName: 'Date', type: 'timestamp' }
                        ],
                    }}
                    selectedSeqs={new Set()}
                    setSelectedSeqs={() => {}}
                    previewedSeqId={null}
                    setPreviewedSeqId={() => {}}
                    orderBy={{ field: 'id', type: 'ascending' }}
                    setOrderByField={() => {}}
                    setOrderDirection={() => {}}
                    columnsToShow={['id', 'name', 'description', 'value', 'date']}
                />
            </div>

            <div
                ref={trackRef}
                className="fixed bottom-4 left-0 right-0 mx-auto h-3 w-4/5 bg-gray-200 rounded-full"
            >
                <div
                    onMouseDown={onMouseDownHandle}
                    className="absolute top-0 left-0 h-full bg-blue-500 rounded-full cursor-grab active:cursor-grabbing"
                    style={{
                        width: `${handleWidth}px`,
                        transform: `translateX(${handlePosition}px)`,
                    }}
                />
            </div>
        </div>
    );
}
