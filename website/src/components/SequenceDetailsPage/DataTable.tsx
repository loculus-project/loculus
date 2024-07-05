import React from 'react';

import { AuthorList } from './AuthorList';
import DataTableEntry from './DataTableEntry';
import { type DataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';
import ReferenceSequenceLinkButton from './ReferenceSequenceLinkButton';
interface Props {
    dataTableData: DataTableData;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    reference: (string | undefined)[];
}

export const ReferenceLink = ({ accession }: { accession: string }) => {
    return (
        <a
            href={'https://www.ncbi.nlm.nih.gov/nuccore/__value__'.replace('__value__', accession.toString())}
            target='_blank'
            className='underline  hover:text-primary-500'
        >
            {accession}
        </a>
    );
};

const DataTableComponent: React.FC<Props> = ({ dataTableData, dataUseTermsHistory, reference }) => {
    return (
        <div>
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
                            {(header.indexOf('mutation') >= 0 || header.indexOf('Alignment') >= 0) && (
                                <ReferenceSequenceLinkButton>reference={reference}</ReferenceSequenceLinkButton>
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
