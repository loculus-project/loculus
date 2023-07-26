import { capitalCase } from 'change-case';
import type { FC } from 'react';

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
    const primaryKeyColumn = {
        field: primaryKey,
        headerName: capitalCase(primaryKey),
    };
    const columns = config.schema.tableColumns.map((field) => ({
        field,
        headerName: capitalCase(field),
    }));

    return (
        <div className='w-full overflow-x-auto'>
            {rows.length !== 0 ? (
                <table className='table'>
                    <thead>
                        <tr>
                            <th>{primaryKeyColumn.headerName}</th>
                            {columns.map((c) => (
                                <th key={c.field}>{c.headerName}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                <td>
                                    <a href={`/sequences/${row[primaryKeyColumn.field]}`}>
                                        {row[primaryKeyColumn.field]}
                                    </a>
                                </td>
                                {columns.map((c) => (
                                    <td key={`${index}-${c.field}`}>{row[c.field]}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className='flex justify-center font-bold text-xl mb-5'>No Data</div>
            )}
        </div>
    );
};
