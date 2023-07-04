import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import * as React from 'react';
import type { FC } from 'react';

export type SequenceData = {
  strain: string;
  date: string;
  pangoLineage: string;
};

type TableProps = {
  data: SequenceData[];
};

export const Table: FC<TableProps> = ({ data }) => {
  const rows: GridRowsProp = data.map((entry, index) => ({
    id: index,
    date: entry.date,
    strain: entry.strain,
    pangoLineage: entry.pangoLineage,
  }));
  const columns: GridColDef[] = [
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
