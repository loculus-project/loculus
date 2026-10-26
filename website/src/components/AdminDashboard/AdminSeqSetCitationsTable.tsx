import type { FC } from 'react';

import { routes } from '../../routes/routes';
import type { AdminSeqSetCitation } from '../../types/seqSetCitation';
import { getAccessionVersionString } from '../../utils/extractAccessionVersion';
import { formatCitationContributors } from '../SeqSetCitations/formatCitationContributors';
import { Button } from '../common/Button';

interface Props {
    citations: AdminSeqSetCitation[];
    onDelete?: (sourceDOI: string) => void;
}

export const AdminSeqSetCitationsTable: FC<Props> = ({ citations, onDelete }) => {
    if (citations.length === 0) {
        return <p className='mt-4'>No publications currently cite any SeqSet.</p>;
    }

    return (
        <table
            className='table-fixed w-full border-collapse border border-gray-200 mt-4'
            data-testid='seqset-citations-table'
        >
            <colgroup>
                <col className='w-[40%]' />
                <col className='w-20' />
                <col className={onDelete !== undefined ? 'w-[35%]' : 'w-[40%]'} />
                {onDelete !== undefined && <col className='w-28' />}
            </colgroup>
            <thead>
                <tr>
                    <th className='border px-2 py-1 text-left'>Citation</th>
                    <th className='border px-2 py-1 text-left'>Year</th>
                    <th className='border px-2 py-1 text-left'>Cited SeqSets</th>
                    {onDelete !== undefined && <th className='border px-2 py-1 text-left'>&nbsp;</th>}
                </tr>
            </thead>
            <tbody>
                {citations.map((citation) => (
                    <tr key={citation.source.sourceDOI} data-testid={`citation-row-${citation.source.sourceDOI}`}>
                        <td className='border px-2 py-1 align-top break-words'>
                            <a
                                className='text-primary-700'
                                href={`https://doi.org/${citation.source.sourceDOI}`}
                                target='_blank'
                                rel='noopener noreferrer'
                            >
                                {citation.source.title}
                            </a>
                            <div className='text-sm text-gray-700'>
                                {formatCitationContributors(citation.source.contributors)}
                            </div>
                            {citation.source.journal !== undefined && citation.source.journal !== null && (
                                <div className='text-sm italic text-gray-700'>{citation.source.journal}</div>
                            )}
                            <div className='text-xs text-gray-500'>{citation.source.sourceDOI}</div>
                        </td>
                        <td className='border px-2 py-1 align-top text-right'>{citation.source.year}</td>
                        <td className='border px-2 py-1 align-top break-words'>
                            <ul className='space-y-1'>
                                {citation.seqSets.map((seqSet) => {
                                    const seqSetAccessionVersion = getAccessionVersionString({
                                        accession: seqSet.seqSetId,
                                        version: seqSet.seqSetVersion,
                                    });

                                    return (
                                        <li key={seqSetAccessionVersion}>
                                            <a
                                                className='text-primary-700'
                                                href={routes.seqSetPage(seqSetAccessionVersion)}
                                            >
                                                {seqSet.name}
                                            </a>
                                            <span className='text-gray-500 text-sm ml-1'>
                                                ({seqSetAccessionVersion}
                                                {seqSet.seqSetDOI ? `, DOI ${seqSet.seqSetDOI}` : ''})
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </td>
                        {onDelete !== undefined && (
                            <td className='border px-2 py-1 align-top'>
                                {citation.origin === 'CURATED' && (
                                    <Button
                                        type='button'
                                        variant='outline'
                                        size='sm'
                                        data-testid='delete-citation-button'
                                        onClick={() => onDelete(citation.source.sourceDOI)}
                                    >
                                        Remove
                                    </Button>
                                )}
                            </td>
                        )}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
