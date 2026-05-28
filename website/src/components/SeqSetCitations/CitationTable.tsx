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

const CitationRow: FC<CitationRowProps> = ({ citation }) => {
    return (
        <tr className='border-b border-gray-200'>
            <td className='p-4'>
                <div className='flex flex-col gap-2'>
                    <div>{citation.source.title}</div>
                    <div className='text-sm text-gray-500'>
                        {citation.source.contributors
                            .map((contributor) => `${contributor.givenName} ${contributor.surname}`)
                            .join(', ')}
                    </div>
                    <div>
                        DOI:
                        <a
                            className='text-primary-600 mx-1'
                            href={`https://doi.org/${citation.source.sourceDOI}`}
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            {citation.source.sourceDOI}
                        </a>
                    </div>
                    {'seqSets' in citation && citation.seqSets.length > 0 && (
                        <span>
                            Via SeqSet{citation.seqSets.length > 1 ? 's' : ''}:
                            {citation.seqSets.map((seqSet) => (
                                <span key={seqSet.seqSetAccession} className='mx-1'>
                                    <a className='text-primary-600' href={routes.seqSetPage(seqSet.seqSetAccession)}>
                                        {seqSet.seqSetAccession}
                                    </a>
                                    <span className='text-gray-500 text-sm ml-1'>
                                        (references {seqSet.sequenceAccession})
                                    </span>
                                </span>
                            ))}
                        </span>
                    )}
                </div>
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
                    <span className='loading loading-spinner'></span>
                ) : error ? (
                    <span>Failed to load citations.</span>
                ) : citations.length > 0 ? (
                    <table className='max-w-3xl w-full border-collapse'>
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
                    <span>No citations found.</span>
                )}
            </div>
        </div>
    );
};
