import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import { visuallyHidden } from '@mui/utils';
import { type FC, type MouseEvent, type ChangeEvent, useState, useMemo } from 'react';

import { routes } from '../../routes/routes';
import type { SeqSet } from '../../types/seqSetCitation';

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
            label: 'Last Updated',
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
        <TableHead sx={{ backgroundColor: 'whitesmoke' }}>
            <TableRow>
                {headCells.map((headCell) => (
                    <TableCell
                        key={headCell.id}
                        align='left'
                        padding='normal'
                        sortDirection={orderBy === headCell.id ? order : false}
                    >
                        <TableSortLabel
                            active={orderBy === headCell.id}
                            direction={orderBy === headCell.id ? order : 'asc'}
                            onClick={createSortHandler(headCell.id)}
                        >
                            {headCell.label}
                            {orderBy === headCell.id ? (
                                <Box component='span' sx={visuallyHidden}>
                                    {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                                </Box>
                            ) : null}
                        </TableSortLabel>
                    </TableCell>
                ))}
            </TableRow>
        </TableHead>
    );
};

type SeqSetListProps = {
    seqSets: SeqSet[];
    username: string;
};

export const SeqSetList: FC<SeqSetListProps> = ({ seqSets, username }) => {
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof SeqSet>('createdAt');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(5);

    const handleRequestSort = (_: MouseEvent<unknown>, property: keyof SeqSet) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleClick = (_: MouseEvent<unknown>, seqSetId: string, seqSetVersion: string) => {
        window.location.href = routes.seqSetPage(seqSetId, seqSetVersion, username);
    };

    const handleChangePage = (_: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const getComparator = <Key extends keyof any>(
        order: Order,
        orderBy?: Key,
    ): ((
        a: { [key in Key]: number | string | undefined },
        b: { [key in Key]: number | string | undefined },
    ) => number) => {
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
    const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - seqSets.length) : 0;

    const visibleRows = useMemo(() => {
        return (seqSets as any)
            .sort(getComparator(order, orderBy))
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
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
        return dateObj.toLocaleDateString('en-US');
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Paper sx={{ width: '100%', mb: 2 }}>
                <TableContainer>
                    <Table sx={{ minWidth: 750 }} aria-labelledby='tableTitle' size='medium'>
                        <SeqSetListHead
                            order={order}
                            orderBy={orderBy}
                            onRequestSort={handleRequestSort}
                            rowCount={seqSets.length}
                        />
                        <TableBody>
                            {visibleRows.map((row: SeqSet, index: number) => {
                                const labelId = `table-row-${index}`;
                                return (
                                    <TableRow
                                        id={labelId}
                                        hover
                                        onClick={(event) =>
                                            handleClick(event, row.seqSetId, row.seqSetVersion.toString())
                                        }
                                        role='checkbox'
                                        tabIndex={-1}
                                        key={row.seqSetId}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell align='left'>{formatDate(row.createdAt)}</TableCell>
                                        <TableCell align='left'>{truncateCell(row.name)}</TableCell>
                                        <TableCell component='th' scope='row'>
                                            {row.seqSetVersion}
                                        </TableCell>
                                        <TableCell align='left'>
                                            {row.seqSetDOI !== undefined
                                                ? truncateCell(row.seqSetDOI as string)
                                                : 'N/A'}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {emptyRows > 0 ? (
                                <TableRow sx={{ height: 53 * emptyRows }}>
                                    <TableCell colSpan={6} />
                                </TableRow>
                            ) : null}
                        </TableBody>
                    </Table>
                </TableContainer>
                {seqSets.length === 0 ? (
                    <p className='px-8 py-8'> You have no SeqSets yet. </p>
                ) : (
                    <TablePagination
                        rowsPerPageOptions={[5, 10, 25]}
                        component='div'
                        count={seqSets.length}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={handleChangePage}
                        onRowsPerPageChange={handleChangeRowsPerPage}
                    />
                )}
            </Paper>
        </Box>
    );
};
