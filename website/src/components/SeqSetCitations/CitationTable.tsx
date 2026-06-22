import { type FC } from 'react';

import { routes } from '../../routes/routes';
import { type SeqSetCitation, type SequenceCitation } from '../../types/seqSetCitation';

interface CitationTableProps {
    isLoading: boolean;
    error: Error | null;
    citations: SeqSetCitation[] | SequenceCitation[];
}

interface CitationRowProps {
    citation: SeqSetCitation | SequenceCitation;
}

export const CitationDetails: FC<{
    citation: SeqSetCitation | SequenceCitation;
    className?: string;
    displayYear?: boolean;
}> = ({ citation, className = '', displayYear = false }) => {
    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            <a
                className='text-primary-700'
                href={`https://doi.org/${citation.source.sourceDOI}`}
                target='_blank'
                rel='noopener noreferrer'
            >
                {citation.source.title}
                {displayYear && ` (${citation.source.year})`}
            </a>
            <div className='text-sm text-gray-700'>
                {citation.source.contributors
                    .map((contributor) => [contributor.givenName, contributor.surname].filter((name) => name).join(' '))
                    .join(', ')}
            </div>
            {'seqSets' in citation && citation.seqSets.length > 0 && (
                <span className='text-sm text-gray-500'>
                    From SeqSet{citation.seqSets.length > 1 ? 's' : ''}:
                    {citation.seqSets.map((seqSet, i) => (
                        <span key={seqSet.seqSetAccessionVersion} className='mx-1'>
                            <a href={routes.seqSetPage(seqSet.seqSetAccessionVersion)}>
                                {seqSet.seqSetAccessionVersion}
                            </a>
                            <span className='text-gray-500 text-sm ml-1'>(references {seqSet.sequenceAccession})</span>
                            {i < citation.seqSets.length - 1 && <span>,</span>}
                        </span>
                    ))}
                </span>
            )}
        </div>
    );
};

const CitationRow: FC<CitationRowProps> = ({ citation }) => {
    return (
        <tr className='border-b border-gray-200'>
            <td className='p-4'>
                <CitationDetails citation={citation} />
            </td>
            <td className='p-4 align-top text-nowrap'>{citation.source.year}</td>
        </tr>
    );
};

export const CitationTable: FC<CitationTableProps> = ({ isLoading, error, citations }) => {
    return (
        <div className='w-full pt-2'>
            <div className='overflow-y-auto max-h-[60vh]'>
                {isLoading ? (
                    <div className='flex justify-center py-8'>
                        <span className='loading loading-spinner'></span>
                    </div>
                ) : error ? (
                    <div className='py-8 text-center'>
                        <span>Failed to load citations.</span>
                    </div>
                ) : citations.length > 0 ? (
                    <table className='w-full border-collapse'>
                        <thead>
                            <tr className='text-left'>
                                <th className='sticky top-0 bg-white p-4 border-b border-gray-200'>Title</th>
                                <th className='sticky top-0 bg-white p-4 border-b border-gray-200'>Year</th>
                            </tr>
                        </thead>
                        <tbody>
                            {citations.map((citation) => (
                                <CitationRow key={citation.source.sourceDOI} citation={citation} />
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className='py-8 text-center'>
                        <span>No citations found.</span>
                    </div>
                )}
            </div>
        </div>
    );
};
