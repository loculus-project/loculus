import { capitalCase } from 'change-case';
import type { Dispatch, FC, ReactElement, SetStateAction } from 'react';
import { Tooltip } from 'react-tooltip';

import { routes } from '../../routes/routes.ts';
import type { Schema } from '../../types/config.ts';
import type { Metadatum, OrderBy } from '../../types/lapis.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import MaterialSymbolsClose from '~icons/material-symbols/close';
import MdiTriangle from '~icons/mdi/triangle';
import MdiTriangleDown from '~icons/mdi/triangle-down';

export type TableSequenceData = {
    [key: string]: Metadatum;
};

function formatField(value: any, maxLength: number, type: string): string {
    if (typeof value === 'string' && value.toString().length > maxLength) {
        return `${value.toString().slice(0, maxLength)}…`;
    } else if (typeof value === 'number' && Number.isInteger(value)) {
        if (type === 'timestamp') {
            return new Date(value * 1000).toISOString().slice(0, 10);
        }
        return formatNumberWithDefaultLocale(value);
    } else if (typeof value === 'boolean') {
        return value ? 'True' : 'False';
    } else {
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

const getColumnWidthStyle = (columnWidth: number | undefined) => columnWidth !== undefined ? `${columnWidth}px` : undefined;

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

    const maxLengths = Object.fromEntries(schema.metadata.map((m) => [m.name, m.truncateColumnDisplayTo ?? 100]));

    const columns = columnsToShow.map((field) => ({
        field,
        headerName: schema.metadata.find((m) => m.name === field)?.displayName ?? capitalCase(field),
        maxLength: maxLengths[field],
        type: schema.metadata.find((m) => m.name === field)?.type ?? 'string',
        columnWidth: schema.metadata.find((m) => m.name === field)?.columnWidth,
    }));

    

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

    const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, seqId: string) => {
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
        <div className='w-full overflow-x-auto text-sm' aria-label='Search Results Table'>
            <Tooltip id='table-tip' />
            {data.length !== 0 ? (
                <table className='w-full text-left border-collapse'>
                    <thead>
                        <tr>
                            <th className='px-2 py-3 md:pl-6 text-xs text-gray-500 cursor-pointer text-left'>
                                {selectedSeqs.size > 0 && (
                                    <MaterialSymbolsClose className='inline w-3 h-3 mx-0.5' onClick={clearSelection} />
                                )}
                            </th>
                            <th
                                onClick={() => handleSort(primaryKey)}
                                className='px-2 py-3 md:pl-6 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer text-left'
                            >
                                {capitalCase(primaryKey)} {orderBy.field === primaryKey && orderIcon}
                            </th>
                            {columns.map((c) => (
                                <th
                                    key={c.field}
                                    onClick={() => handleSort(c.field)}
                                    className='px-2 py-3 text-xs font-medium tracking-wider text-gray-500 uppercase cursor-pointer last:pr-6 text-left'
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
                                className={`hover:bg-primary-100 border-gray-100 ${
                                    row[primaryKey] === previewedSeqId ? 'bg-gray-200' : ''
                                } cursor-pointer`}
                                onClick={(e) => handleRowClick(e, row[primaryKey] as string)}
                                onAuxClick={(e) => handleRowClick(e, row[primaryKey] as string)}
                            >
                                <td
                                    className='px-2 whitespace-nowrap text-primary-900 md:pl-6'
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent row-level click events from triggering
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
                                        onChange={(e) => setRowSelected(row[primaryKey] as string, e.target.checked)}
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
                                        className='px-2 py-2 text-primary-900 last:pr-6'
                                        style={{
                                            minWidth: getColumnWidthStyle(c.columnWidth),
                                        }}
                                        data-tooltip-content={
                                            typeof row[c.field] === 'string' &&
                                            row[c.field]!.toString().length > c.maxLength
                                                ? row[c.field]!.toString()
                                                : ''
                                        }
                                        data-tooltip-id='table-tip'
                                    >
                                        {formatField(row[c.field], c.maxLength, c.type)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className='flex justify-center font-bold text-xl my-8'>No Data</div>
            )}
        </div>
    );
};
