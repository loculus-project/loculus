import React from 'react';

import { AuthorList } from './AuthorList';
import DataTableEntry from './DataTableEntry';
import { type DataTableData } from './getDataTableData';
import { type DataUseTermsHistoryEntry } from '../../types/backend';

interface DataTableProps {
    dataTableData: DataTableData;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
}

const DataTableComponent: React.FC<DataTableProps> = ({ dataTableData, dataUseTermsHistory }) => {
    return (
        <div>
            {dataTableData.topmatter.authors && dataTableData.topmatter.authors.length > 0 && (
                <div className='px-6 mb-4'>
                    <AuthorList authors={dataTableData.topmatter.authors} />
                </div>
            )}
            <div
                className='grid gap-x-6'
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 32rem), 1fr))' }}
            >
                {dataTableData.table.map(({ header, rows }) => (
                    <div key={header} className='p-4'>
                        <h1 className='py-2 text-lg font-semibold border-b'>{header}</h1>
                        <div className='mt-4'>
                            {rows.map((entry, index) => (
                                <DataTableEntry key={index} data={entry} dataUseTermsHistory={dataUseTermsHistory} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DataTableComponent;
