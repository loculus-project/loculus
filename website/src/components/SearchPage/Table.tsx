import { DataGrid } from '@mui/x-data-grid';
import { capitalCase } from 'change-case';
import React, { useLayoutEffect, useState, type FC, useMemo } from 'react';

import type { Config } from '../../types';

export type TableSequenceData = {
    [key: string]: string;
};

type TableProps = {
    config: Config;
    data: TableSequenceData[];
};

export const Table: FC<TableProps> = ({ data, config }) => {
    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

    useLayoutEffect(() => {
        const handleResize = (): void => {
            setViewportWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    // Calculate the number of columns to omit based on the container width
    const maximumNumberOfColumns = useMemo(() => Math.floor(viewportWidth / 300), [viewportWidth]);

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
            flex: 3,
            renderCell: (params: any) => (
                <a href={params.value.url} rel='noopener noreferrer'>
                    {params.value.label}
                </a>
            ),
        },
        ...config.schema.tableColumns.slice(0, maximumNumberOfColumns).map((field) => ({
            field,
            headerName: capitalCase(field),
            flex: 2,
        })),
    ];

    return (
        <div style={{ height: 'auto', width: '100%' }}>
            {rows.length !== 0 ? (
                <DataGrid rows={rows} columns={columns} disableColumnMenu hideFooter />
            ) : (
                <div className='flex justify-center font-bold text-xl mb-5'>No Data</div>
            )}
        </div>
    );
};
