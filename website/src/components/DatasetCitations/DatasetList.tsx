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

import type { Dataset } from '../../types/datasetCitation';

type Order = 'asc' | 'desc';

interface DatasetListHeadProps {
    onRequestSort: (event: MouseEvent<unknown>, property: keyof Dataset) => void;
    order: Order;
    orderBy: string;
    rowCount: number;
}

const DatasetListHead = (props: DatasetListHeadProps) => {
    const { order, orderBy, onRequestSort } = props;

    interface HeadCell {
        id: keyof Dataset;
        label: string;
    }

    const headCells: readonly HeadCell[] = [
        {
            id: 'createdAt',
            label: 'Last Updated',
        },
        {
            id: 'datasetVersion',
            label: 'Version',
        },
        {
            id: 'name',
            label: 'Name',
        },
        {
            id: 'datasetDOI',
            label: 'Dataset DOI',
        },
    ];

    const createSortHandler = (property: keyof Dataset) => (event: MouseEvent<unknown>) => {
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

type DatasetListProps = {
    datasets: Dataset[];
    username: string;
};

export const DatasetList: FC<DatasetListProps> = ({ datasets, username }) => {
    const [order, setOrder] = useState<Order>('desc');
    const [orderBy, setOrderBy] = useState<keyof Dataset>('createdAt');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(5);

    const handleRequestSort = (_: MouseEvent<unknown>, property: keyof Dataset) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const handleClick = (_: MouseEvent<unknown>, datasetId: string, datasetVersion: string) => {
        window.location.href = `/datasets/${datasetId}?version=${datasetVersion}&user=${username}`;
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
    const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - datasets.length) : 0;

    const visibleRows = useMemo(() => {
        return (datasets as any)
            .sort(getComparator(order, orderBy))
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    }, [datasets, order, orderBy, page, rowsPerPage]);

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
                        <DatasetListHead
                            order={order}
                            orderBy={orderBy}
                            onRequestSort={handleRequestSort}
                            rowCount={datasets.length}
                        />
                        <TableBody>
                            {visibleRows.map((row: Dataset, index: number) => {
                                const labelId = `table-row-${index}`;
                                return (
                                    <TableRow
                                        id={labelId}
                                        hover
                                        onClick={(event) =>
                                            handleClick(event, row.datasetId, row.datasetVersion.toString())
                                        }
                                        role='checkbox'
                                        tabIndex={-1}
                                        key={row.datasetId}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell align='left'>{formatDate(row.createdAt)}</TableCell>
                                        <TableCell align='left'>{truncateCell(row.name)}</TableCell>
                                        <TableCell component='th' scope='row'>
                                            {row.datasetVersion}
                                        </TableCell>
                                        <TableCell align='left'>
                                            {row.datasetDOI !== undefined
                                                ? truncateCell(row.datasetDOI as string)
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
                {datasets.length === 0 ? (
                    <p className='px-8 py-8'> You have no datasets yet. </p>
                ) : (
                    <TablePagination
                        rowsPerPageOptions={[5, 10, 25]}
                        component='div'
                        count={datasets.length}
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
