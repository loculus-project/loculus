import { type FC } from 'react';

import { type SeqSetCitation } from '../../types/seqSetCitation';

interface SeqSetCitationsListProps {
    isLoading: boolean;
    error: Error | null;
    seqSetCitations: SeqSetCitation[];
}

interface SeqSetCitationItemProps {
    seqSetCitation: SeqSetCitation;
}

const SeqSetCitationDOI: FC<SeqSetCitationItemProps> = ({ seqSetCitation }) => {
    return (
        <span>
            DOI:
            <a
                className='text-primary-600 mx-1'
                href={`https://doi.org/${seqSetCitation.source.sourceDOI}`}
                target='_blank'
                rel='noopener noreferrer'
            >
                {seqSetCitation.source.sourceDOI}
            </a>
        </span>
    );
};

const SeqSetCitationItem: FC<SeqSetCitationItemProps> = ({ seqSetCitation }) => {
    return (
        <div className='flex flex-col gap-2'>
            <div>
                {seqSetCitation.source.contributors
                    .map((contributor) => `${contributor.givenName} ${contributor.surname}`)
                    .join(', ')}
                . <i>{seqSetCitation.source.title}</i>, {seqSetCitation.source.year}.
            </div>
            <div>
                <SeqSetCitationDOI seqSetCitation={seqSetCitation} />
            </div>
        </div>
    );
};

export const SeqSetCitationsList: FC<SeqSetCitationsListProps> = ({ isLoading, error, seqSetCitations }) => {
    return (
        <div className='flex flex-col items-center w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>SeqSet Citations</h1>
            </div>
            <div className='overflow-y-auto max-h-[60vh]'>
                {isLoading ? (
                    <span className='loading loading-spinner'></span>
                ) : error ? (
                    <span>Failed to load citations.</span>
                ) : seqSetCitations.length > 0 ? (
                    <ul className='max-w-3xl space-y-8'>
                        {seqSetCitations.map((seqSetCitation) => (
                            <li key={seqSetCitation.source.sourceDOI}>
                                <SeqSetCitationItem seqSetCitation={seqSetCitation} />
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span>No citations found for this SeqSet.</span>
                )}
            </div>
        </div>
    );
};
