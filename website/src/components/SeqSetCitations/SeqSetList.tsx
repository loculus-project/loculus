import MUIPagination from '@mui/material/Pagination';
import { type FC, type MouseEvent, useState, useMemo } from 'react';

import useClientFlag from '../../hooks/isClient';
import { routes } from '../../routes/routes';
import type { SeqSet } from '../../types/seqSetCitation';
import MdiTriangle from '~icons/mdi/triangle';
import MdiTriangleDown from '~icons/mdi/triangle-down';

type Order = 'asc' | 'desc';

interface SeqSetListHeadProps {
    onRequestSort: (event: MouseEvent<unknown>, property: keyof SeqSet) => void;
    order: Order;
    orderBy: string;
    rowCount: number;
}

const SeqSetListHead = (props: SeqSetListHeadProps) => {
    const { order, orderBy, onRequestSort } = props;

    interface HeadCell {
        id: keyof SeqSet;
        label: string;
    }

    const headCells: readonly HeadCell[] = [
        {
            id: 'createdAt',
            label: 'Last updated',
        },
        {
            id: 'name',
            label: 'Name',
        },
        {
            id: 'seqSetVersion',
            label: 'Version',
        },
        {
            id: 'seqSetDOI',
            label: 'DOI',
        },
    ];

    const createSortHandler = (property: keyof SeqSet) => (event: MouseEvent<unknown>) => {
        onRequestSort(event, property);
    };

    return (
        <thead className='bg-gray-100'>
            <tr>
                {headCells.map((headCell, index) => (
                    <th
                        key={headCell.id}
                        className={`px-2 py-5 text-xs w-1/12 font-medium tracking-wider uppercase ${index === 0 ? 'pl-6' : 'last:pr-6 text-left'}`}
                    >
                        <span
                            className={`cursor-pointer ${orderBy === headCell.id ? 'active' : ''}`}
                            onClick={createSortHandler(headCell.id)}
                        >
                            {headCell.label}
                            {orderBy === headCell.id ? (
                                <span>
                                    {order === 'desc' ? (
                                        <MdiTriangleDown className='w-3 h-3 ml-1 inline' />
                                    ) : (
                                        <MdiTriangle className='w-3 h-3 ml-1 inline' />
                                    )}
                                </span>
                            ) : null}
                        </span>
                    </th>
                ))}
            </tr>
        </thead>
    );
};

type SeqSetListProps = {
    seqSets: SeqSet[];
};

export const SeqSetList: FC<SeqSetListProps> = ({ seqSets }) => {
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof SeqSet>('createdAt');
    const [page, setPage] = useState(1);
    const isClient = useClientFlag();
    const rowsPerPage = 5;

    const handleRequestSort = (_: MouseEvent<unknown>, property: keyof SeqSet) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleClick = (_: MouseEvent<unknown>, seqSetId: string, seqSetVersion: string) => {
        window.location.href = routes.seqSetPage(seqSetId, seqSetVersion);
    };

    const handleChangePage = (_: unknown, newPage: number) => {
        setPage(newPage);
    };

    const getMaxPages = () => {
        return Math.ceil(seqSets.length / rowsPerPage);
    };

    const getComparator = (order: Order, orderBy?: keyof SeqSet): ((a: SeqSet, b: SeqSet) => number) => {
        if (orderBy === undefined) {
            return () => 0;
        }

        const descendingComparator = <T,>(a: T, b: T, orderBy: keyof T) => {
            if (b[orderBy] < a[orderBy]) {
                return -1;
            }
            if (b[orderBy] > a[orderBy]) {
                return 1;
            }
            return 0;
        };
        return order === 'desc'
            ? (a, b) => descendingComparator(a, b, orderBy)
            : (a, b) => -descendingComparator(a, b, orderBy);
    };

    // Avoid a layout jump when reaching the last page with empty rows.
    const emptyRows = page > 1 ? Math.max(0, page * rowsPerPage - seqSets.length) : 0;

    const visibleRows = useMemo(() => {
        return seqSets.sort(getComparator(order, orderBy)).slice((page - 1) * rowsPerPage, page * rowsPerPage);
    }, [seqSets, order, orderBy, page, rowsPerPage]);

    const maxCellLength = 25;
    const truncateCell = (cell: string | undefined | null) => {
        if (cell === undefined || cell === null) {
            return 'N/A';
        }
        if (cell.length > maxCellLength) {
            return cell.substring(0, maxCellLength) + '...';
        }
        return cell;
    };

    const formatDate = (date: string) => {
        const dateObj = new Date(date);
        return dateObj.toISOString().split('T')[0];
    };

    return (
        <div className='shadow-md'>
            <table className='w-full text-left border-collapse'>
                {seqSets.length > 0 ? (
                    <SeqSetListHead
                        order={order}
                        orderBy={orderBy}
                        onRequestSort={handleRequestSort}
                        rowCount={seqSets.length}
                    />
                ) : null}

                <tbody className='bg-white'>
                    {visibleRows.map((row: SeqSet, index: number) => {
                        const labelId = `table-row-${index}`;
                        return (
                            <tr
                                id={labelId}
                                className='hover:bg-primary-100 border-gray-100 cursor-pointer'
                                onClick={(event) => handleClick(event, row.seqSetId, row.seqSetVersion.toString())}
                                key={`${row.seqSetId}.${row.seqSetVersion}`}
                                data-testid={isClient ? row.name : 'disabled'}
                            >
                                <td className='px-2 whitespace-nowrap text-primary-900 pl-6'>
                                    {formatDate(row.createdAt)}
                                </td>
                                <td className='px-2 py-2 text-primary-900 last:pr-6'>{truncateCell(row.name)}</td>
                                <td className='px-2 py-2 text-primary-900 last:pr-6'>{row.seqSetVersion}</td>
                                <td className='px-2 py-2 text-primary-900 last:pr-6'>
                                    {row.seqSetDOI !== undefined ? truncateCell(row.seqSetDOI) : 'N/A'}
                                </td>
                            </tr>
                        );
                    })}
                    {emptyRows > 0 ? (
                        <tr style={{ height: 40 * emptyRows }}>
                            <td colSpan={8} />
                        </tr>
                    ) : null}
                </tbody>
            </table>
            {seqSets.length === 0 ? (
                <p className='px-8 py-8'> You have no SeqSets yet. </p>
            ) : (
                <MUIPagination
                    className='py-4 w-full flex justify-center'
                    page={page}
                    count={getMaxPages()}
                    color='primary'
                    variant='outlined'
                    shape='rounded'
                    onChange={handleChangePage}
                />
            )}
        </div>
    );
};
