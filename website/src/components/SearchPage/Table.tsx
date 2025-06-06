import { capitalCase } from 'change-case';
import type { Dispatch, FC, ReactElement, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Tooltip } from 'react-tooltip';

import ScrollContainer from './ScrollContainer.jsx';
import { routes } from '../../routes/routes.ts';
import type { Schema } from '../../types/config.ts';
import type { Metadatum, OrderBy } from '../../types/lapis.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiTriangle from '~icons/mdi/triangle';
import MdiTriangleDown from '~icons/mdi/triangle-down';
const MAX_TOOLTIP_LENGTH = 150;

export type TableSequenceData = {
    [key: string]: Metadatum;
};

function formatField(value: unknown, type: string): string {
    if (typeof value === 'number' && Number.isInteger(value)) {
        if (type === 'timestamp') {
            return new Date(value * 1000).toISOString().slice(0, 10);
        }
        return formatNumberWithDefaultLocale(value);
    } else if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    } else {
        // @ts-expect-error: TODO(#3451) add proper types
        return value;
    }
}

type TableProps = {
    schema: Schema;
    data: TableSequenceData[];
    selectedSeqs: Set<string>;
    setSelectedSeqs: Dispatch<SetStateAction<Set<string>>>;
    previewedSeqId: string | null;
    setPreviewedSeqId: (seqId: string | null) => void;
    orderBy: OrderBy;
    setOrderByField: (field: string) => void;
    setOrderDirection: (direction: 'ascending' | 'descending') => void;
    columnsToShow: string[];
};

const getColumnWidthStyle = (columnWidth: number | undefined) =>
    columnWidth !== undefined ? `${columnWidth}px` : `130px`;

type CellContentProps = {
    value: Metadatum;
    type: string;
    columnWidth: number | undefined;
};

const CellContent: FC<CellContentProps> = ({ value, type, columnWidth }) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        if (textRef.current) {
            setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
        }
    }, [value]);

    const formattedValue = formatField(value, type);
    const tooltipText =
        typeof formattedValue === 'string'
            ? formattedValue.slice(0, MAX_TOOLTIP_LENGTH) + (formattedValue.length > MAX_TOOLTIP_LENGTH ? '..' : '')
            : formattedValue;

    return (
        <span
            ref={textRef}
            className='truncate block'
            style={{ maxWidth: getColumnWidthStyle(columnWidth) }}
            data-tooltip-id={isTruncated ? 'table-tip' : undefined}
            data-tooltip-content={isTruncated ? tooltipText : undefined}
        >
            {formattedValue}
        </span>
    );
};

export const Table: FC<TableProps> = ({
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
}) => {
    const primaryKey = schema.primaryKey;

    const columns = columnsToShow
        .map((field) => {
            const metadata = schema.metadata.find((m) => m.name === field);
            return {
                field,
                headerName: metadata?.displayName ?? capitalCase(field),
                type: metadata?.type ?? 'string',
                columnWidth: metadata?.columnWidth,
                order: metadata?.order ?? Number.MAX_SAFE_INTEGER,
            };
        })
        .sort((a, b) => a.order - b.order);

    const handleSort = (field: string) => {
        if (orderBy.field === field) {
            if (orderBy.type === 'ascending') {
                setOrderDirection('descending');
            } else {
                setOrderDirection('ascending');
            }
        } else {
            setOrderByField(field);
            setOrderDirection('ascending');
        }
    };

    const mouseDownSelection = useRef('');

    const handleRowMouseDown = () => {
        const sel = window.getSelection();
        mouseDownSelection.current = sel?.toString() ?? '';
    };

    const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, seqId: string) => {
        // Only treat as a row click if the user didn't change the selection
        const sel = window.getSelection();
        const current = sel?.toString() ?? '';
        if (current && current !== mouseDownSelection.current) {
            return;
        }

        const detectMob = () => {
            const toMatch = [/Android/i, /webOS/i, /iPhone/i, /iPod/i, /BlackBerry/i, /Windows Phone/i];

            return toMatch.some((toMatchItem) => {
                return navigator.userAgent.match(toMatchItem);
            });
        };

        if (e.button === 0) {
            const screenWidth = window.screen.width;

            if (!e.ctrlKey && !e.metaKey && screenWidth > 1024 && !detectMob()) {
                e.preventDefault();
                setPreviewedSeqId(seqId);
            } else {
                window.open(routes.sequenceEntryDetailsPage(seqId));
            }
        } else if (e.button === 1) {
            window.open(routes.sequenceEntryDetailsPage(seqId));
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

    const orderIcon: ReactElement =
        orderBy.type === 'ascending' ? (
            <MdiTriangle className='w-3 h-3 ml-1 inline' />
        ) : (
            <MdiTriangleDown className='w-3 h-3 ml-1 inline' />
        );

    return (
        <div className='text-sm'>
            <ScrollContainer>
                <Tooltip id='table-tip' />
                {data.length !== 0 ? (
                    <table className='min-w-full text-left border-collapse'>
                        <thead>
                            <tr className='border-gray-400 border-b mb-100'>
                                <th className='px-2 py-2 md:pl-6 text-xs text-gray-500 cursor-pointer text-left'>
                                    {selectedSeqs.size > 0 && (
                                        <MaterialSymbolsClose
                                            className='inline w-3 h-3 mx-0.5'
                                            onClick={clearSelection}
                                        />
                                    )}
                                </th>
                                <th
                                    onClick={() => handleSort(primaryKey)}
                                    className='px-2 py-2 md:pl-6 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer text-left'
                                >
                                    {capitalCase(primaryKey)} {orderBy.field === primaryKey && orderIcon}
                                </th>
                                {columns.map((c) => (
                                    <th
                                        key={c.field}
                                        onClick={() => handleSort(c.field)}
                                        className='px-2 py-2 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer box-content last:pr-6 text-left'
                                        style={{
                                            minWidth: getColumnWidthStyle(c.columnWidth),
                                        }}
                                    >
                                        {c.headerName} {orderBy.field === c.field && orderIcon}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className='bg-white'>
                            {data.map((row, index) => (
                                <tr
                                    key={index}
                                    className={`hover:bg-primary-100 border-b border-gray-200 ${
                                        row[primaryKey] === previewedSeqId ? 'bg-gray-200' : ''
                                    } cursor-pointer`}
                                    onMouseDown={handleRowMouseDown}
                                    onClick={(e) => handleRowClick(e, row[primaryKey] as string)}
                                    onAuxClick={(e) => handleRowClick(e, row[primaryKey] as string)}
                                    data-testid='sequence-row'
                                >
                                    <td
                                        className='px-2 whitespace-nowrap text-primary-900 md:pl-6'
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent row-level click events from triggering
                                            // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- we need to cast to the special HTML element type
                                            const checkbox = e.currentTarget.querySelector(
                                                'input[type="checkbox"]',
                                            ) as HTMLInputElement;
                                            checkbox.checked = !checkbox.checked;
                                            setRowSelected(row[primaryKey] as string, checkbox.checked);
                                        }}
                                    >
                                        <input
                                            type='checkbox'
                                            className='text-primary-900 hover:text-primary-800 hover:no-underline'
                                            onChange={(e) =>
                                                setRowSelected(row[primaryKey] as string, e.target.checked)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            checked={selectedSeqs.has(row[primaryKey] as string)}
                                        />
                                    </td>

                                    <td
                                        className='px-2 whitespace-nowrap text-primary-900 md:pl-6'
                                        aria-label='SearchResult'
                                    >
                                        <a
                                            href={routes.sequenceEntryDetailsPage(row[primaryKey] as string)}
                                            className='text-primary-900 hover:text-primary-800 hover:no-underline'
                                            onClick={(e) => e.preventDefault()}
                                            onAuxClick={(e) => e.preventDefault()}
                                        >
                                            {row[primaryKey]}
                                        </a>
                                    </td>
                                    {columns.map((c) => (
                                        <td
                                            key={`${index}-${c.field}`}
                                            className='px-2 py-2 text-primary-900 box-content last:pr-6'
                                            style={{
                                                minWidth: getColumnWidthStyle(c.columnWidth),
                                            }}
                                        >
                                            <CellContent
                                                value={row[c.field]}
                                                type={c.type}
                                                columnWidth={c.columnWidth}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className='flex justify-center font-bold text-xl my-8'>No Data</div>
                )}
            </ScrollContainer>
        </div>
    );
};
