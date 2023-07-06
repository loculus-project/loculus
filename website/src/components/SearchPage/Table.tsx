import { DataGrid } from '@mui/x-data-grid';
import { capitalCase } from 'change-case';
import type { FC } from 'react';
import * as React from 'react';

export type TableSequenceData = {
    [key: string]: string;
};

type TableProps = {
    data: TableSequenceData[];
    idName: string;
    columnNames: string[];
};

export const Table: FC<TableProps> = ({ data, idName, columnNames }) => {
    const rows = data.map((entry, index) => ({
        id: index,
        ...entry,
        [idName]: { label: entry[idName], url: `/sequences/${entry[idName]}` },
    }));
    const columns = [
        {
            field: idName,
            headerName: capitalCase(idName),
            flex: 1,
            renderCell: (params: any) => (
                <a href={params.value.url} rel='noopener noreferrer'>
                    {params.value.label}
                </a>
            ),
        },
        ...columnNames.map((field) => ({
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
