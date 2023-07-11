import { DataGrid } from '@mui/x-data-grid';
import { capitalCase } from 'change-case';
import type { FC } from 'react';
import * as React from 'react';

import type { Config } from '../../types';

export type TableSequenceData = {
    [key: string]: string;
};

type TableProps = {
    config: Config;
    data: TableSequenceData[];
};

export const Table: FC<TableProps> = ({ data, config }) => {
    const primaryKey = config.schema.primaryKey;
    const rows = data.map((entry, index) => ({
        id: index,
        ...entry,
        [primaryKey]: { label: entry[primaryKey], url: `/sequences/${entry[primaryKey]}` },
    }));
    const columns = [
        {
            field: primaryKey,
            headerName: capitalCase(primaryKey),
            flex: 1,
            renderCell: (params: any) => (
                <a href={params.value.url} rel='noopener noreferrer'>
                    {params.value.label}
                </a>
            ),
        },
        ...config.schema.tableColumns.map((field) => ({
            field,
            headerName: capitalCase(field),
            flex: 1,
        })),
    ];

    return (
        <div style={{ height: 400, width: '100%' }}>
            <DataGrid rows={rows} columns={columns} />
        </div>
    );
};
