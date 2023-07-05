import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import React, { type FC, useState } from 'react';

import { SearchForm } from './SearchForm';
import { Table, type TableSequenceData } from './Table';
import type { Config } from '../../config';

export const SearchPage: FC<Config> = ({ schema }) => {
    const [data, setData] = useState<TableSequenceData[]>([]);

    return (
        <>
            <h1 className='text-sky-500 font-bold text-xl'>Search</h1>
            <div className='flex flex-col space-y-4'>
                <LocalizationProvider dateAdapter={AdapterLuxon}>
                    <SearchForm fields={schema.metadata} setSequenceData={setData} />
                </LocalizationProvider>
                <Table data={data} idName={schema.primaryKey} columnNames={[...schema.tableColumns]} />
            </div>
        </>
    );
};
