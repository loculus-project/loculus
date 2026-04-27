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
                DOI:
                <a
                    className='text-primary-500 mx-1'
                    href={`https://doi.org/${seqSetCitation.citationDOI}`}
                    target='_blank'
                    rel='noopener noreferrer'
                >
                    {seqSetCitation.citationDOI}
                </a>
            </div>
        </div>
    );
};

export const SeqSetCitationsList: FC<SeqSetCitationsListProps> = ({ clientConfig, seqSet }) => {
    const seqSetAccessionVersion = `${seqSet.seqSetId}.${seqSet.seqSetVersion}`;

    const {
        isLoading: isSeqSetCitationsLoading,
        error: isSeqSetCitationsError,
        data: seqSetCitations,
    } = seqSetCitationClientHooks(clientConfig).useGetSeqSetCitations(
        { params: { seqSetDOI: seqSet.seqSetDOI! } },
        { enabled: !!seqSet.seqSetDOI },
    );

    return (
        <div className='flex flex-col items-center gap-4'>
            <div className='py-5'>
                <h1 className='text-xl font-semibold'>Citations for {seqSetAccessionVersion}</h1>
            </div>
            <hr className='w-full max-w-3xl border-t border-gray-300 mb-5' />
            {!seqSet.seqSetDOI ? (
                <span>This SeqSet does not have a DOI, so no citation data is available.</span>
            ) : isSeqSetCitationsLoading ? (
                <span className='loading loading-spinner'></span>
            ) : isSeqSetCitationsError ? (
                <span>Failed to load citations.</span>
            ) : seqSetCitations.length > 0 ? (
                <ul className='max-w-3xl space-y-8'>
                    {seqSetCitations.map((seqSetCitation) => (
                        <li key={seqSetCitation.citationDOI}>
                            <SeqSetCitationItem seqSetCitation={seqSetCitation} />
                        </li>
                    ))}
                </ul>
            ) : (
                <span>No citations found for this SeqSet.</span>
            )}
        </div>
    );
};
