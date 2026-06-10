import { useState, type FC } from 'react';

import { CitationTable } from './CitationTable';
import { routes } from '../../routes/routes';
import type { SeqSetCitation, SequenceCitation } from '../../types/seqSetCitation';
import { BaseDialog } from '../common/BaseDialog';

interface CitationListProps {
    isLoading: boolean;
    error: Error | null;
    citations: SeqSetCitation[] | SequenceCitation[];
    limit: number;
    modalTitle?: string;
}

const CitationList: FC<CitationListProps> = ({ isLoading, error, citations, limit, modalTitle }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (isLoading) {
        return <div>Loading citations...</div>;
    }

    if (error) {
        return <div>Error loading citations: {error.message}</div>;
    }

    if (citations.length === 0) {
        return <div>No citations found.</div>;
    }

    const displayViewAll = citations.length > limit;

    return (
        <ul>
            {citations.slice(0, limit).map((citation: SeqSetCitation | SequenceCitation) => (
                <li key={citation.source.sourceDOI}>
                    <a href={`https://doi.org/${citation.source.sourceDOI}`} target='_blank' rel='noopener noreferrer'>
                        {citation.source.title} ({citation.source.year})
                    </a>
                    <div className='text-sm text-gray-500'>
                        {citation.source.contributors
                            .map((contributor) =>
                                [contributor.givenName, contributor.surname].filter((name) => name).join(' '),
                            )
                            .join(', ')}
                    </div>
                    {'seqSets' in citation && citation.seqSets.length > 0 && (
                        <span className='text-sm'>
                            From SeqSet{citation.seqSets.length > 1 ? 's' : ''}:
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
                </li>
            ))}
            {displayViewAll && (
                <li>
                    <a className='text-primary-600' href='#' onClick={() => setIsOpen(true)}>
                        View all {citations.length} citations
                    </a>
                </li>
            )}
            <BaseDialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={modalTitle ?? 'Citations'}
                fullWidth={false}
                className='min-h-[60vh]'
            >
                <CitationTable isLoading={isLoading} error={error} citations={citations} />
            </BaseDialog>
        </ul>
    );
};

export default CitationList;
