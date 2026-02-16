import React from 'react';

import DataTableEntryValue from './DataTableEntryValue';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';

interface Props {
    data: TableDataEntry;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
}

const DataTableComponent: React.FC<Props> = ({ data, dataUseTermsHistory }) => {
    const { label, type } = data;
    return (
        <>
            {type.kind === 'metadata' && (
                <div className='text-sm grid my-1' style={{ gridTemplateColumns: '200px 1fr' }}>
                    <div className='font-medium text-gray-900 break-inside-avoid pr-4'>{label}</div>
                    <DataTableEntryValue data={data} dataUseTermsHistory={dataUseTermsHistory} />
                </div>
            )}

            {type.kind === 'mutation' && (
                <div className='text-sm my-1'>
                    <div className='font-medium text-gray-900 break-inside-avoid py-2'>{label}</div>
                    <DataTableEntryValue data={data} dataUseTermsHistory={dataUseTermsHistory} />
                </div>
            )}
        </>
    );
};

export default DataTableComponent;
