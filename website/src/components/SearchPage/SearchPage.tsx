import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import React, { useState, type FC } from 'react';

import { SearchForm } from './SearchForm';
import { type TableSequenceData, Table } from './Table';
import type { Metadata } from '../../config';

interface SearchPageProps {
    fields: Metadata[];
}

export const SearchPage: FC<SearchPageProps> = ({ fields }) => {
    const [data, setData] = useState<TableSequenceData[]>([]);

    return (
        <>
            <h1 className='text-sky-500 font-bold text-xl'>Search</h1>
            <div className='flex flex-col space-y-4'>
                <LocalizationProvider dateAdapter={AdapterLuxon}>
                    <SearchForm fields={fields} setSequenceData={setData} />
                </LocalizationProvider>
                <Table data={data} />
            </div>
        </>
    );
};
