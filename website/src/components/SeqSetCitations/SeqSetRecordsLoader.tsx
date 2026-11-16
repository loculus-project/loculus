import type { FC, ReactNode } from 'react';

import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import type { SeqSet, SeqSetRecord } from '../../types/seqSetCitation';
import { Spinner } from '../common/Spinner';

type SeqSetRecordsLoaderProps = {
    clientConfig: ClientConfig;
    seqSet: SeqSet;
    children: (seqSetRecords: SeqSetRecord[]) => ReactNode;
};

/**
 * Fetches the records of a SeqSet in the browser and renders `children` once they are available.
 * SeqSets can contain hundreds of thousands of records, so they must not be passed as island props:
 * Astro would serialize them into the server-rendered HTML.
 */
export const SeqSetRecordsLoader: FC<SeqSetRecordsLoaderProps> = ({ clientConfig, seqSet, children }) => {
    const { data, isLoading, error } = seqSetCitationClientHooks(clientConfig).useGetSeqSetRecords({
        params: { seqSetId: seqSet.seqSetId, version: seqSet.seqSetVersion },
    });

    if (isLoading) {
        return (
            <div className='flex justify-center py-8'>
                <Spinner label='Loading sequences' />
            </div>
        );
    }

    if (error !== null) {
        return (
            <div className='py-8 text-center'>
                <span>Failed to load the sequences of this SeqSet.</span>
            </div>
        );
    }

    return <>{children(data)}</>;
};
