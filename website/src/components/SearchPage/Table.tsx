import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import { capitalCase } from 'change-case';
import type { FC } from 'react';
import * as React from 'react';

import { displayConfig } from '../../config';

export type TableSequenceData = Record<(typeof displayConfig.searchPage.resultTableFields)[number], any>;

type TableProps = {
  data: TableSequenceData[];
};

export const Table: FC<TableProps> = ({ data }) => {
  const rows: GridRowsProp = data.map((entry, index) => ({
    id: index,
    ...entry,
  }));
  const columns: GridColDef[] = displayConfig.searchPage.resultTableFields.map((field) => ({
    field,
    headerName: capitalCase(field),
    flex: 1,
  }));

  return (
    <div style={{ height: 400, width: '100%', overflow: 'hidden' }}>
      <div style={{ height: 400, width: '100%', overflow: 'auto' }}>
        <DataGrid rows={rows} columns={columns} />
      </div>
    </div>
  );
};
