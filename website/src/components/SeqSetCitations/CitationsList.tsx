import { type FC } from 'react';

import { routes } from '../../routes/routes';
import { type SeqSetCitation, type SequenceCitation, type SeqSetCitingSequence } from '../../types/seqSetCitation';

interface CitationsListProps {
    title: string;
    isLoading: boolean;
    error: Error | null;
    citations: SeqSetCitation[] | SequenceCitation[];
}

interface CitationItemProps {
    citation: SeqSetCitation | SequenceCitation;
}

interface CitationSeqSetsProps {
    seqSets: SeqSetCitingSequence[];
}

const CitationDOI: FC<CitationItemProps> = ({ citation }) => {
    return (
        <span>
            DOI:
            <a
                className='text-primary-600 mx-1'
                href={`https://doi.org/${citation.sourceDOI}`}
                target='_blank'
                rel='noopener noreferrer'
            >
                {citation.sourceDOI}
            </a>
        </span>
    );
};

const CitationSeqSets: FC<CitationSeqSetsProps> = ({ seqSets }) => {
    return (
        <span>
            Via SeqSet{seqSets.length > 1 ? 's' : ''}:
            {seqSets.map((seqSet) => (
                <span key={seqSet.seqSetAccession} className='mx-1'>
                    <a className='text-primary-600' href={routes.seqSetPage(seqSet.seqSetAccession)}>
                        {seqSet.seqSetAccession}
                    </a>
                    <span className='text-gray-500 text-sm ml-1'>(references {seqSet.sequenceAccession})</span>
                </span>
            ))}
        </span>
    );
};

const CitationItem: FC<CitationItemProps> = ({ citation }) => {
    return (
        <div className='flex flex-col gap-2'>
            <div>
                {citation.contributors
                    .map((contributor) => `${contributor.givenName} ${contributor.surname}`)
                    .join(', ')}
                . <i>{citation.title}</i>, {citation.year}.
            </div>
            <div>
                <CitationDOI citation={citation} />
            </div>
            {'seqSets' in citation && citation.seqSets.length > 0 && <CitationSeqSets seqSets={citation.seqSets} />}
        </div>
    );
};

export const CitationsList: FC<CitationsListProps> = ({ title, isLoading, error, citations }) => {
    return (
        <div className='flex flex-col items-center w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>{title}</h1>
            </div>
            <div className='overflow-y-auto max-h-[60vh]'>
                {isLoading ? (
                    <span className='loading loading-spinner'></span>
                ) : error ? (
                    <span>Failed to load citations.</span>
                ) : citations.length > 0 ? (
                    <ul className='max-w-3xl space-y-8'>
                        {citations.map((citation) => (
                            <li key={citation.sourceDOI}>
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
