import React from 'react';

import { AuthorList } from './AuthorList';
import DataTableEntry from './DataTableEntry';
import ReferenceSequenceLinkButton from './ReferenceSequenceLinkButton';
import { type DataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';
import { type ReferenceAccession } from '../../types/referencesGenomes';
interface Props {
    dataTableData: DataTableData;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    reference: ReferenceAccession[];
}

const DataTableComponent: React.FC<Props> = ({ dataTableData, dataUseTermsHistory, reference }) => {
    const hasReferenceAccession = reference.filter((item) => item.insdcAccessionFull !== undefined).length > 0;

    return (
        <div>
            {dataTableData.topmatter.sequenceDisplayName !== undefined && (
                <div className='px-6 mb-4 italic'>Display Name: {dataTableData.topmatter.sequenceDisplayName}</div>
            )}
            {dataTableData.topmatter.authors !== undefined && dataTableData.topmatter.authors.length > 0 && (
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
                        <div className='flex flex-row'>
                            <h1 className='py-2 text-lg font-semibold border-b mr-2'>{header}</h1>
                            {hasReferenceAccession && (header.includes('mutation') || header.includes('Alignment')) && (
                                <ReferenceSequenceLinkButton reference={reference} />
                            )}
                        </div>
                        <div className='mt-4'>
                            {rows.map((entry: TableDataEntry, index: number) => (
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
