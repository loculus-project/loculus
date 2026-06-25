import type { FC } from 'react';

import { routes } from '../../routes/routes';
import type { AdminSeqSetCitation } from '../../types/seqSetCitation';

interface Props {
    citations: AdminSeqSetCitation[];
}

const formatContributors = (contributors: AdminSeqSetCitation['source']['contributors']) =>
    contributors
        .map((contributor) => [contributor.givenName, contributor.surname].filter((name) => name).join(' '))
        .join(', ');

export const SeqSetCitationsTable: FC<Props> = ({ citations }) => {
    if (citations.length === 0) {
        return <p className='mt-4'>No publications currently cite any SeqSet.</p>;
    }

    return (
        <table className='table-auto border-collapse border border-gray-200 mt-4'>
            <thead>
                <tr>
                    <th className='border px-2 py-1 text-left'>Citation</th>
                    <th className='border px-2 py-1 text-left'>Year</th>
                    <th className='border px-2 py-1 text-left'>Cited SeqSets</th>
                </tr>
            </thead>
            <tbody>
                {citations.map((citation) => (
                    <tr key={citation.source.sourceDOI}>
                        <td className='border px-2 py-1 align-top'>
                            <a
                                className='text-primary-700'
                                href={`https://doi.org/${citation.source.sourceDOI}`}
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                {citation.source.title}
                            </a>
                            <div className='text-sm text-gray-700'>
                                {formatContributors(citation.source.contributors)}
                            </div>
                            <div className='text-xs text-gray-500'>{citation.source.sourceDOI}</div>
                        </td>
                        <td className='border px-2 py-1 align-top text-right'>{citation.source.year}</td>
                        <td className='border px-2 py-1 align-top'>
                            <ul className='space-y-1'>
                                {citation.seqSets.map((seqSet) => (
                                    <li key={seqSet.seqSetAccessionVersion}>
                                        <a
                                            className='text-primary-700'
                                            href={routes.seqSetPage(seqSet.seqSetAccessionVersion)}
                                        >
                                            {seqSet.name}
                                        </a>
                                        <span className='text-gray-500 text-sm ml-1'>
                                            ({seqSet.seqSetAccessionVersion}
                                            {seqSet.seqSetDOI ? `, DOI ${seqSet.seqSetDOI}` : ''})
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
