import { useState, type FC } from 'react';

import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { parseAccessionVersionFromString } from '../../utils/extractAccessionVersion';
import { CitationsList } from '../SeqSetCitations/CitationsList';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';
import { withQueryProvider } from '../common/withQueryProvider';
import MdiViewListOutline from '~icons/mdi/view-list-outline';

type SequenceCitationsProps = {
    clientConfig: ClientConfig;
    accessionVersion: string;
};

const SequenceCitationsInner: FC<SequenceCitationsProps> = ({ clientConfig, accessionVersion }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const {
        isLoading: isSequenceCitationsLoading,
        error: sequenceCitationsError,
        data: sequenceCitations,
    } = seqSetCitationClientHooks(clientConfig).useGetSequenceCitedBy({
        params: { accession: accession, version: version?.toString() ?? '' },
    });

    return (
        <>
            <BaseDialog
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                title=''
                fullWidth={false}
                className='min-h-[60vh]'
            >
                <div className='min-w-[1000px]'></div>
                <CitationsList
                    title='Sequence Citations'
                    isLoading={isSequenceCitationsLoading}
                    error={sequenceCitationsError}
                    citations={sequenceCitations ?? []}
                />
            </BaseDialog>
            <Button className='btn btn-sm btn-outline mr-2' onClick={() => setIsOpen(true)}>
                <MdiViewListOutline className='w-4 h-4' />
                <span className='hidden sm:block '>View Citations</span>
            </Button>
        </>
    );
};

export const SequenceCitations = withQueryProvider(SequenceCitationsInner);
