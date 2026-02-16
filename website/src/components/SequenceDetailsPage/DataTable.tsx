import React from 'react';

import { AuthorList } from './AuthorList';
import DataTableEntry from './DataTableEntry';
import { type DataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';
import { type ReferenceAccession, type ReferenceGenomesInfo } from '../../types/referencesGenomes';
import {
    getInsdcAccessionsFromSegmentReferences,
    type SegmentReferenceSelections,
} from '../../utils/sequenceTypeHelpers';
import AkarInfo from '~icons/ri/information-line';

interface Props {
    dataTableData: DataTableData;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    referenceGenomesInfo: ReferenceGenomesInfo;
    segmentReferences?: SegmentReferenceSelections;
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
    referenceGenomesInfo,
    segmentReferences,
}) => {
    const references = getInsdcAccessionsFromSegmentReferences(referenceGenomesInfo, segmentReferences);
    const hasReferenceAccession = references.filter((item) => item.insdcAccessionFull !== undefined).length > 0;

    const authorSection = dataTableData.table.filter(({ header }) => header.toLowerCase().includes('authors'));
    const generalSections = dataTableData.table.filter(
        ({ header }) =>
            !header.toLowerCase().includes('alignment') &&
            !header.toLowerCase().includes('mutation') &&
            !header.toLowerCase().includes('authors'),
    );
    const alignmentSections = dataTableData.table.filter(({ header }) => header.toLowerCase().includes('alignment'));
    const mutationSections = dataTableData.table.filter(({ header }) => header.toLowerCase().includes('mutation'));
    return (
        <div>
            {dataTableData.topmatter.sequenceDisplayName !== undefined && (
                <div className='pr-6 mb-4 italic'>{dataTableData.topmatter.sequenceDisplayName}</div>
            )}
            {dataTableData.topmatter.authors !== undefined && dataTableData.topmatter.authors.length > 0 && (
                <div className='pr-6 mb-4'>
                    <AuthorList authors={dataTableData.topmatter.authors} />
                    {authorSection
                        .flatMap(({ rows }) => rows)
                        .map((entry: TableDataEntry, index: number) => (
                            <h4 key={index} className='text-sm text-gray-500'>
                                {entry.value}
                            </h4>
                        ))}
                </div>
            )}

            {generalSections.length > 0 && (
                <div
                    className='grid gap-x-6'
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 32rem), 1fr))' }}
                >
                    {generalSections.map(({ header, rows }) => (
                        <div key={header} className='p-4 pl-0'>
                            <div className='flex flex-row'>
                                <h1 className='py-2 text-lg font-semibold border-b mr-2'>{header}</h1>
                            </div>
                            <div className='mt-4'>
                                {rows.map((entry: TableDataEntry, index: number) => (
                                    <DataTableEntry
                                        key={index}
                                        data={entry}
                                        dataUseTermsHistory={dataUseTermsHistory}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {alignmentSections.length > 0 && <hr className='my-8 border-t-2 border-gray-200' />}

            {alignmentSections.length > 0 && (
                <div>
                    <h2 className='text-xl font-bold mb-2'>Alignment and QC</h2>
                </div>
            )}

            {alignmentSections.length > 0 && (
                <div
                    className='grid gap-x-6'
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 20rem), 1fr))' }}
                >
                    {alignmentSections.map(({ header, rows }) => (
                        <div key={header} className='p-4 pl-0 max-w-xs'>
                            <div className='flex flex-row'></div>
                            <div className='mt-4'>
                                {rows.map((entry: TableDataEntry, index: number) => (
                                    <DataTableEntry
                                        key={index}
                                        data={entry}
                                        dataUseTermsHistory={dataUseTermsHistory}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {mutationSections.length > 0 && <hr className='my-8 border-t-2 border-gray-200' />}

            {mutationSections.length > 0 && (
                <div
                    className='grid gap-x-6'
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 32rem), 1fr))' }}
                >
                    {mutationSections.map(({ header, rows }) => (
                        <div key={header} className='p-4 pl-0'>
                            <div className='flex flex-row'>
                                <h1 className='py-2 text-lg font-semibold border-b mr-2'>{header}</h1>
                            </div>
                            {hasReferenceAccession && (
                                <h2 className='pt-2 text-xs text-gray-500'>
                                    <AkarInfo className='inline-block h-4 w-4 mr-1 -mt-0.5' />
                                    Mutations called relative to the <ReferenceDisplay reference={references} />{' '}
                                    reference
                                    {references.length > 1 ? 's' : ''}
                                </h2>
                            )}
                            <div className='mt-4'>
                                {rows.map((entry: TableDataEntry, index: number) => (
                                    <DataTableEntry
                                        key={index}
                                        data={entry}
                                        dataUseTermsHistory={dataUseTermsHistory}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DataTableComponent;
