import { DataGrid } from '@mui/x-data-grid';
import type { FC } from 'react';
import * as React from 'react';

export type SequenceData = {
    strain: string;
    date: string;
    pangoLineage: string;
};

type TableProps = {
    data: SequenceData[];
};

export const Table: FC<TableProps> = ({ data }) => {
    const rows = data.map((entry, index) => ({
        id: index,
        date: entry.date,
        strain: entry.strain,
        pangoLineage: entry.pangoLineage,
    }));
    const columns = [
        { field: 'date', headerName: 'Date', width: 150 },
        { field: 'strain', headerName: 'Strain', width: 150 },
        { field: 'pangoLineage', headerName: 'Pango Lineage', width: 150 },
    ];

    return (
        <div style={{ height: 300, width: '100%' }}>
            <DataGrid rows={rows} columns={columns} />
        </div>
    );
};
