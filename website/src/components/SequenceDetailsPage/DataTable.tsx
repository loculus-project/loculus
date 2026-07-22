import React from 'react';

import { AuthorList } from './AuthorList';
import DataTableEntry from './DataTableEntry';
import { type DataTableData } from './getDataTableData';
import { type TableDataEntry } from './types';
import { type DataUseTermsHistoryEntry } from '../../types/backend';
import { DEFAULT_AA_MUTATION_DETAILS_HEADER, DEFAULT_NUC_MUTATION_DETAILS_HEADER } from '../../types/config';
import { type ReferenceAccession, type ReferenceGenomesInfo } from '../../types/referencesGenomes';
import type { SequenceCitation } from '../../types/seqSetCitation';
import { deduplicateSemicolonSeparated } from '../../utils/deduplicateSemicolonSeparated';
import {
    getInsdcAccessionsFromSegmentReferences,
    type SegmentReferenceSelections,
} from '../../utils/sequenceTypeHelpers';
import CitationList from '../SeqSetCitations/CitationList';
import AkarInfo from '~icons/ri/information-line';

interface Props {
    dataTableData: DataTableData;
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
    referenceGenomesInfo: ReferenceGenomesInfo;
    segmentReferences?: SegmentReferenceSelections;
    sequenceCitations?: SequenceCitation[];
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
    sequenceCitations,
}) => {
    const references = getInsdcAccessionsFromSegmentReferences(referenceGenomesInfo, segmentReferences);
    const hasReferenceAccession = references.filter((item) => item.insdcAccessionFull !== undefined).length > 0;

    const authorSection = dataTableData.table.filter(({ header }) => header.toLowerCase().includes('authors'));
    const generalSections = dataTableData.table.filter(
        ({ header }) =>
            !header.toLowerCase().includes('alignment') &&
            !header.toLowerCase().includes('authors') &&
            header !== DEFAULT_NUC_MUTATION_DETAILS_HEADER &&
            header !== DEFAULT_AA_MUTATION_DETAILS_HEADER,
    );
    const alignmentSections = dataTableData.table.filter(({ header }) => header.toLowerCase().includes('alignment'));
    const mutationSections = dataTableData.table.filter(
        ({ header }) => header === DEFAULT_NUC_MUTATION_DETAILS_HEADER || header === DEFAULT_AA_MUTATION_DETAILS_HEADER,
    );
    const sequenceDisplayName = dataTableData.topmatter.sequenceDisplayName;
    const authors = dataTableData.topmatter.authors ?? [];
    const hasAuthors = authors.length > 0;
    const hasRecordOverview = sequenceDisplayName !== undefined || hasAuthors;
    const hasSequenceCitations = sequenceCitations !== undefined && sequenceCitations.length > 0;

    return (
        <div>
            {hasRecordOverview && (
                <div className='w-[calc(100%+2rem)] -ml-4 mb-3 p-4'>
                    {sequenceDisplayName !== undefined && (
                        <div
                            className={`pr-6 text-lg font-semibold text-gray-900 leading-snug ${hasAuthors ? 'mb-3' : ''}`}
                        >
                            {sequenceDisplayName}
                        </div>
                    )}
                    {hasAuthors && (
                        <div className='pr-6'>
                            <AuthorList authors={authors} />
                            {authorSection
                                .flatMap(({ rows }) => rows)
                                .map((entry: TableDataEntry, index: number) => (
                                    <h4 key={index} className='text-sm text-gray-500 mt-1' title={entry.label}>
                                        {typeof entry.value === 'string'
                                            ? deduplicateSemicolonSeparated(entry.value)
                                            : entry.value}
                                    </h4>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {(generalSections.length > 0 || hasSequenceCitations) && (
                <div
                    className='w-[calc(100%+2rem)] -ml-4 p-4 grid gap-x-10 gap-y-5'
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 32rem), 1fr))' }}
                >
                    {generalSections.map(({ header, rows }) => (
                        <div key={header} className='min-w-0'>
                            <div className='flex flex-row pb-1 border-b border-gray-200'>
                                <h1 className='text-sm font-semibold text-gray-800'>{header}</h1>
                            </div>
                            <div className='mt-1'>
                                {rows.map((entry: TableDataEntry, index: number) => (
                                    <DataTableEntry
                                        key={index}
                                        data={entry}
                                        dataUseTermsHistory={dataUseTermsHistory}
                                        referenceGenomesInfo={referenceGenomesInfo}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                    {hasSequenceCitations && (
                        <div className='min-w-0'>
                            <div className='flex flex-row pb-1 border-b border-gray-200'>
                                <h1 className='text-sm font-semibold text-gray-800'>Cited in</h1>
                            </div>
                            <div className='mt-2'>
                                <CitationList
                                    citations={sequenceCitations}
                                    maxDisplayedCitations={3}
                                    modalTitle='Sequence Citations'
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {alignmentSections.length > 0 && (
                <div className='-mx-4 xl:mr-0 xl:max-w-xl mt-8 p-4'>
                    <h2 className='text-sm font-semibold text-gray-800 pb-1 border-b border-gray-200 mb-1'>
                        Alignment and QC
                    </h2>
                    <div
                        className={alignmentSections.length === 1 ? '' : 'grid gap-x-10 gap-y-5'}
                        style={
                            alignmentSections.length === 1
                                ? undefined
                                : { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100vw, 20rem), 1fr))' }
                        }
                    >
                        {alignmentSections.map(({ header, rows }) => (
                            <div key={header} className='min-w-0'>
                                <div className='mt-1'>
                                    {rows.map((entry: TableDataEntry, index: number) => (
                                        <DataTableEntry
                                            key={index}
                                            data={entry}
                                            dataUseTermsHistory={dataUseTermsHistory}
                                            referenceGenomesInfo={referenceGenomesInfo}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mutationSections.length > 0 && (
                <div className='w-[calc(100%+2rem)] -ml-4 mt-8 p-4 grid gap-y-6'>
                    {mutationSections.map(({ header, rows }) => (
                        <div key={header} className='min-w-0'>
                            <div className='flex flex-row pb-1 border-b border-gray-200'>
                                <h1 className='text-sm font-semibold text-gray-800'>{header}</h1>
                            </div>
                            {hasReferenceAccession &&
                                (header === DEFAULT_NUC_MUTATION_DETAILS_HEADER ||
                                    header === DEFAULT_AA_MUTATION_DETAILS_HEADER) && (
                                    <h2 className='pt-2 text-xs text-gray-500'>
                                        <AkarInfo className='inline-block h-4 w-4 mr-1 -mt-0.5' />
                                        {header === DEFAULT_AA_MUTATION_DETAILS_HEADER
                                            ? 'Substitutions'
                                            : 'Mutations'}{' '}
                                        called relative to the <ReferenceDisplay reference={references} /> reference
                                        {references.length > 1 ? 's' : ''}
                                    </h2>
                                )}
                            <div className='mt-2'>
                                {rows.map((entry: TableDataEntry, index: number) => (
                                    <DataTableEntry
                                        key={index}
                                        data={entry}
                                        dataUseTermsHistory={dataUseTermsHistory}
                                        referenceGenomesInfo={referenceGenomesInfo}
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
