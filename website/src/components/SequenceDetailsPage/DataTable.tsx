import React from 'react';

import { AuthorList } from './AuthorList';
import DataTableEntry from './DataTableEntry';
import ReferenceSequenceLinkButton from './ReferenceSequenceLinkButton';
import { type DataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';
import {
    type ReferenceAccession,
    type ReferenceGenomesLightweightSchema,
} from '../../types/referencesGenomes';
import AkarInfo from '~icons/ri/information-line';

interface Props {
    dataTableData: DataTableData;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema;
    segmentReferences: Record<string, string> | null;
}

const ReferenceDisplay = ({ reference }: { reference: ReferenceAccession[] }) => {
    const refLength = reference.length;
    return reference.map((ref, index) => (
        <React.Fragment key={index}>
            <a
                className='underline hover:text-primary-500'
                target='_blank'
                href={`https://www.ncbi.nlm.nih.gov/nuccore/${ref.insdcAccessionFull}`}
            >
                {ref.insdcAccessionFull}
            </a>
            {index < refLength - 2 ? ', ' : index === refLength - 2 ? ' & ' : ''}
        </React.Fragment>
    ));
};

const DataTableComponent: React.FC<Props> = ({
    dataTableData,
    dataUseTermsHistory,
    referenceGenomeLightweightSchema,
    segmentReferences,
}) => {
    // Gather INSDC accessions from all segment/reference combinations
    const reference: ReferenceAccession[] = [];
    if (segmentReferences !== null) {
        for (const [segmentName, referenceName] of Object.entries(segmentReferences)) {
            const segmentData = referenceGenomeLightweightSchema.segments[segmentName];
            if (segmentData && segmentData.insdcAccessions[referenceName]) {
                reference.push(segmentData.insdcAccessions[referenceName]);
            }
        }
    }
    const hasReferenceAccession = reference.filter((item) => item.insdcAccessionFull !== undefined).length > 0;

    return (
        <div>
            {dataTableData.topmatter.sequenceDisplayName !== undefined && (
                <div className='pr-6 mb-4 italic'>Display Name: {dataTableData.topmatter.sequenceDisplayName}</div>
            )}
            {dataTableData.topmatter.authors !== undefined && dataTableData.topmatter.authors.length > 0 && (
                <div className='pr-6 mb-4'>
                    <AuthorList authors={dataTableData.topmatter.authors} />
                </div>
            )}
            <div
                className='grid gap-x-6'
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 32rem), 1fr))' }}
            >
                {dataTableData.table.map(({ header, rows }) => (
                    <div key={header} className='p-4 pl-0'>
                        <div className='flex flex-row'>
                            <h1 className='py-2 text-lg font-semibold border-b mr-2'>{header}</h1>
                            {reference !== null && hasReferenceAccession && header.includes('Alignment') && (
                                <ReferenceSequenceLinkButton reference={reference} />
                            )}
                        </div>
                        {reference !== null && hasReferenceAccession && header.includes('mutation') && (
                            <h2 className='pt-2 text-xs text-gray-500'>
                                <AkarInfo className='inline-block h-4 w-4 mr-1 -mt-0.5' />
                                Mutations called relative to the <ReferenceDisplay reference={reference} /> reference
                                {reference.length > 1 ? 's' : ''}
                            </h2>
                        )}
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
