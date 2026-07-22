import React from 'react';

import DataTableEntryValue from './DataTableEntryValue';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes';

interface Props {
    data: TableDataEntry;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    referenceGenomesInfo: ReferenceGenomesInfo;
}

const DataTableComponent: React.FC<Props> = ({ data, dataUseTermsHistory, referenceGenomesInfo }) => {
    const { label, type } = data;
    return (
        <>
            {type.kind === 'metadata' && (
                <div
                    className='text-sm grid py-1 border-b border-gray-100 last:border-b-0'
                    style={{ gridTemplateColumns: '200px 1fr' }}
                >
                    <div className='font-normal text-gray-700 break-inside-avoid pr-4'>{label}</div>
                    <DataTableEntryValue
                        data={data}
                        dataUseTermsHistory={dataUseTermsHistory}
                        referenceGenomesInfo={referenceGenomesInfo}
                    />
                </div>
            )}

            {type.kind === 'mutation' && (
                <div className='text-sm my-1'>
                    <div className='font-normal text-gray-700 break-inside-avoid py-2'>{label}</div>
                    <DataTableEntryValue
                        data={data}
                        dataUseTermsHistory={dataUseTermsHistory}
                        referenceGenomesInfo={referenceGenomesInfo}
                    />
                </div>
            )}
        </>
    );
};

export default DataTableComponent;
