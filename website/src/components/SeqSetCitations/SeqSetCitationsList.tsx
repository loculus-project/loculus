import { type FC } from 'react';

import { seqSetCitationClientHooks } from '../../services/serviceHooks';
import type { ClientConfig } from '../../types/runtimeConfig';
import { type SeqSet, type SeqSetCitation } from '../../types/seqSetCitation';

interface SeqSetCitationsListProps {
    clientConfig: ClientConfig;
    seqSet: SeqSet;
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
                href={`https://doi.org/${seqSetCitation.sourceDOI}`}
                target='_blank'
                rel='noopener noreferrer'
            >
                {seqSetCitation.sourceDOI}
            </a>
        </span>
    );
};

const SeqSetCitationItem: FC<SeqSetCitationItemProps> = ({ seqSetCitation }) => {
    return (
        <div className='flex flex-col gap-2'>
            <div>
                {seqSetCitation.contributors
                    .map((contributor) => `${contributor.givenName} ${contributor.surname}`)
                    .join(', ')}
                . <i>{seqSetCitation.title}</i>, {seqSetCitation.year}.
            </div>
            <div>
                <SeqSetCitationDOI seqSetCitation={seqSetCitation} />
            </div>
        </div>
    );
};

export const SeqSetCitationsList: FC<SeqSetCitationsListProps> = ({ clientConfig, seqSet }) => {
    const {
        isLoading: isSeqSetCitationsLoading,
        error: seqSetCitationsError,
        data: seqSetCitations,
    } = seqSetCitationClientHooks(clientConfig).useGetSeqSetCitations({
        params: { seqSetId: seqSet.seqSetId, version: seqSet.seqSetVersion },
    });

    return (
        <div className='flex flex-col items-center w-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>SeqSet Citations</h1>
            </div>
            <div className='overflow-y-auto max-h-[60vh]'>
                {isSeqSetCitationsLoading ? (
                    <span className='loading loading-spinner'></span>
                ) : seqSetCitationsError ? (
                    <span>Failed to load citations.</span>
                ) : seqSetCitations.length > 0 ? (
                    <ul className='max-w-3xl space-y-8'>
                        {seqSetCitations.map((seqSetCitation) => (
                            <li key={seqSetCitation.sourceDOI}>
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
