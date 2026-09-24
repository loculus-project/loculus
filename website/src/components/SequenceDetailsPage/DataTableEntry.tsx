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
                <div className='text-sm grid gap-x-4 py-1.5 border-b border-gray-100 last:border-b-0 grid-cols-[9rem_minmax(0,1fr)] sm:grid-cols-[12rem_minmax(0,1fr)]'>
                    <div className='text-gray-500 break-inside-avoid'>{label}</div>
                    <DataTableEntryValue
                        data={data}
                        dataUseTermsHistory={dataUseTermsHistory}
                        referenceGenomesInfo={referenceGenomesInfo}
                    />
                </div>
            )}

            {type.kind === 'mutation' && (
                <div className='text-sm py-3 border-b border-gray-100 last:border-b-0 first:pt-0'>
                    <div className='mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 break-inside-avoid'>
                        {label}
                    </div>
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
