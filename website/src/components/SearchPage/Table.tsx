import { capitalCase } from 'change-case';
import type { FC } from 'react';

import { routes } from '../../routes.ts';
import type { Schema } from '../../types/config.ts';

export type TableSequenceData = {
    [key: string]: string | number | null;
};

type TableProps = {
    organism: string;
    schema: Schema;
    data: TableSequenceData[];
};

export const Table: FC<TableProps> = ({ organism, data, schema }) => {
    const primaryKey = schema.primaryKey;

    const columns = schema.tableColumns.map((field) => ({
        field,
        headerName: capitalCase(field),
    }));

    return (
        <div className='w-full overflow-x-auto'>
            {data.length !== 0 ? (
                <table className='table'>
                    <thead>
                        <tr>
                            <th>{capitalCase(primaryKey)}</th>
                            {columns.map((c) => (
                                <th key={c.field}>{c.headerName}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                <td>
                                    <a href={routes.sequencesDetailsPage(organism, row[primaryKey] as string)}>
                                        {row[primaryKey]}
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
