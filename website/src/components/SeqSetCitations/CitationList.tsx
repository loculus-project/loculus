import { useState, type FC } from 'react';

import { CitationDetails, CitationTable } from './CitationTable';
import type { SeqSetCitation, SequenceCitation } from '../../types/seqSetCitation';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

interface CitationListProps {
    isLoading: boolean;
    error: Error | null;
    citations: SeqSetCitation[] | SequenceCitation[];
    limit: number;
    modalTitle?: string;
}

const CitationList: FC<CitationListProps> = ({ isLoading, error, citations, limit, modalTitle }) => {
    const [isOpen, setIsOpen] = useState(false);
    const displayViewAll = citations.length > limit;

    return (
        <div className='space-y-2'>
            <BaseDialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title={modalTitle ?? 'Citations'}
                fullWidth={false}
                className='min-h-[60vh]'
            >
                <CitationTable isLoading={isLoading} error={error} citations={citations} />
            </BaseDialog>
            {isLoading ? (
                <div className='flex justify-center py-8'>
                    <span className='loading loading-spinner'></span>
                </div>
            ) : error ? (
                <div className='py-8 text-center'>
                    <span>Failed to load citations.</span>
                </div>
            ) : citations.length > 0 ? (
                <div className='space-y-4'>
                    <ul className='space-y-4'>
                        {citations.slice(0, limit).map((citation: SeqSetCitation | SequenceCitation) => (
                            <li key={citation.source.sourceDOI}>
                                <CitationDetails citation={citation} titleClassName='text-sm underline' showYear />
                            </li>
                        ))}
                    </ul>
                    {displayViewAll && (
                        <Button className='text-sm hover:underline' onClick={() => setIsOpen(true)}>
                            View all citations ({citations.length})…
                        </Button>
                    )}
                </div>
            ) : (
                <div className='py-8 text-center'>
                    <span>No citations found.</span>
                </div>
            )}
        </div>
    );
};

export default CitationList;
