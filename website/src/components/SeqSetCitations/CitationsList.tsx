import { type FC } from 'react';

import { type SeqSetCitation } from '../../types/seqSetCitation';

interface CitationsListProps {
    isLoading: boolean;
    error: Error | null;
    citations: SeqSetCitation[];
}

interface CitationItemProps {
    citation: SeqSetCitation;
}

const CitationDOI: FC<CitationItemProps> = ({ citation }) => {
    return (
        <span>
            DOI:
            <a
                className='text-primary-600 mx-1'
                href={`https://doi.org/${citation.source.sourceDOI}`}
                target='_blank'
                rel='noopener noreferrer'
            >
                {citation.source.sourceDOI}
            </a>
        </span>
    );
};

const CitationItem: FC<CitationItemProps> = ({ citation }) => {
    return (
        <div className='flex flex-col gap-2'>
            <div>
                {citation.source.contributors
                    .map((contributor) => `${contributor.givenName} ${contributor.surname}`)
                    .join(', ')}
                . <i>{citation.source.title}</i>, {citation.source.year}.
            </div>
            <div>
                <CitationDOI citation={citation} />
            </div>
        </div>
    );
};

export const CitationsList: FC<CitationsListProps> = ({ isLoading, error, citations }) => {
    return (
        <div className='w-full pt-2'>
            <div className='overflow-y-auto max-h-[60vh]'>
                {isLoading ? (
                    <span className='loading loading-spinner'></span>
                ) : error ? (
                    <span>Failed to load citations.</span>
                ) : citations.length > 0 ? (
                    <ul className='max-w-3xl space-y-4'>
                        {citations.map((citation) => (
                            <li key={citation.source.sourceDOI} className='border border-gray-200 p-4 rounded-lg'>
                                <CitationItem citation={citation} />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span>No citations found.</span>
                )}
            </div>
        </div>
    );
};
