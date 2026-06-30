import { useState, type FC } from 'react';

import { CitationDetails, CitationTable } from './CitationTable';
import type { SeqSetCitation, SequenceCitation } from '../../types/seqSetCitation';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

interface CitationListProps {
    citations: SeqSetCitation[] | SequenceCitation[];
    maxDisplayedCitations?: number;
    modalTitle?: string;
}

const CitationList: FC<CitationListProps> = ({ citations, maxDisplayedCitations, modalTitle }) => {
    const [isOpen, setIsOpen] = useState(false);
    const displayCitationsModalButton = maxDisplayedCitations !== undefined && citations.length > maxDisplayedCitations;

    return (
        <div className='space-y-2'>
            <BaseDialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={modalTitle ?? 'Citations'}
                fullWidth={false}
                className='min-h-[60vh]'
            >
                <CitationTable isLoading={false} error={null} citations={citations} />
            </BaseDialog>
            {citations.length > 0 && (
                <div className='space-y-2'>
                    <ul className='space-y-4'>
                        {(maxDisplayedCitations !== undefined
                            ? citations.slice(0, maxDisplayedCitations)
                            : citations
                        ).map((citation: SeqSetCitation | SequenceCitation) => (
                            <li key={citation.source.sourceDOI}>
                                <CitationDetails citation={citation} className='text-sm' displayYear />
                            </li>
                        ))}
                    </ul>
                    {displayCitationsModalButton && (
                        <Button className='text-sm hover:underline' onClick={() => setIsOpen(true)}>
                            View all citations ({citations.length})...
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

export default CitationList;
