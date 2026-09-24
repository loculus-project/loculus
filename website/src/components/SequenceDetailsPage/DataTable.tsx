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
    const hasSequenceCitations = sequenceCitations !== undefined && sequenceCitations.length > 0;

    const renderRows = (rows: TableDataEntry[]) =>
        rows.map((entry: TableDataEntry, index: number) => (
            <DataTableEntry
                key={index}
                data={entry}
                dataUseTermsHistory={dataUseTermsHistory}
                referenceGenomesInfo={referenceGenomesInfo}
            />
        ));

    return (
        <div className='space-y-6'>
            {(dataTableData.topmatter.sequenceDisplayName !== undefined ||
                (dataTableData.topmatter.authors !== undefined && dataTableData.topmatter.authors.length > 0)) && (
                <div className='max-w-5xl space-y-3'>
                    {dataTableData.topmatter.sequenceDisplayName !== undefined && (
                        <div className='text-lg italic text-gray-700'>
                            {dataTableData.topmatter.sequenceDisplayName}
                        </div>
                    )}
                    {dataTableData.topmatter.authors !== undefined && dataTableData.topmatter.authors.length > 0 && (
                        <div className='text-gray-900'>
                            <AuthorList authors={dataTableData.topmatter.authors} />
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
                <div className='columns-1 gap-6 lg:columns-2'>
                    {generalSections.map(({ header, rows }) => (
                        <SectionCard key={header} title={header} className='mb-6 break-inside-avoid'>
                            {renderRows(rows)}
                        </SectionCard>
                    ))}
                    {hasSequenceCitations && (
                        <SectionCard title='Cited in' className='mb-6 break-inside-avoid'>
                            <CitationList
                                citations={sequenceCitations}
                                maxDisplayedCitations={3}
                                modalTitle='Sequence Citations'
                            />
                        </SectionCard>
                    )}
                </div>
            )}

            {alignmentSections.length === 1 && (
                <SectionCard title={alignmentSections[0].header}>
                    <div className='gap-x-10 lg:columns-2 [&>*]:break-inside-avoid'>
                        {renderRows(alignmentSections[0].rows)}
                    </div>
                </SectionCard>
            )}
            {alignmentSections.length > 1 && (
                <div
                    className='grid gap-6'
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 32rem), 1fr))' }}
                >
                    {alignmentSections.map(({ header, rows }) => (
                        <SectionCard key={header} title={header}>
                            {renderRows(rows)}
                        </SectionCard>
                    ))}
                </div>
            )}

            {mutationSections.map(({ header, rows }) => (
                <SectionCard
                    key={header}
                    title={header}
                    subtitle={
                        hasReferenceAccession && (
                            <>
                                <AkarInfo className='inline-block h-4 w-4 mr-1 -mt-0.5' />
                                {header === DEFAULT_AA_MUTATION_DETAILS_HEADER ? 'Substitutions' : 'Mutations'} called
                                relative to the <ReferenceDisplay reference={references} /> reference
                                {references.length > 1 ? 's' : ''}
                            </>
                        )
                    }
                >
                    {renderRows(rows)}
                </SectionCard>
            ))}
        </div>
    );
};

const SectionCard: React.FC<{
    title: string;
    subtitle?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}> = ({ title, subtitle, className = '', children }) => (
    <section className={`rounded-xl border border-gray-200 bg-white ${className}`}>
        <div className='border-b border-gray-200 px-5 py-3'>
            <h2 className='text-base font-semibold text-gray-900'>{title}</h2>
            {subtitle !== undefined && subtitle !== false && <p className='mt-0.5 text-xs text-gray-500'>{subtitle}</p>}
        </div>
        <div className='px-5 py-3'>{children}</div>
    </section>
);

export default DataTableComponent;
