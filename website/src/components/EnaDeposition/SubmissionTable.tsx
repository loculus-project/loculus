import { type FC } from 'react';

import { StatusBadge } from './StatusBadge';
import type { PaginatedSubmissions } from '../../types/enaDeposition';

interface Props {
    submissions: PaginatedSubmissions;
    selectedSubmissions: Set<string>;
    onSelectionChange: (accessionVersion: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    onPageChange: (page: number) => void;
}

export const SubmissionTable: FC<Props> = ({
    submissions,
    selectedSubmissions,
    onSelectionChange,
    onSelectAll,
    onPageChange,
}) => {
    const allSelected = submissions.items.length > 0 && submissions.items.every((s) => selectedSubmissions.has(`${s.accession}.${s.version}`));

    return (
        <div>
            <div className='overflow-x-auto'>
                <table className='min-w-full divide-y divide-gray-200'>
                    <thead className='bg-gray-50'>
                        <tr>
                            <th scope='col' className='px-3 py-3 text-left'>
                                <input
                                    type='checkbox'
                                    checked={allSelected}
                                    onChange={(e) => onSelectAll(e.target.checked)}
                                    className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded'
                                />
                            </th>
                            <th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                                Accession
                            </th>
                            <th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                                Organism
                            </th>
                            <th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                                Group
                            </th>
                            <th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                                Status
                            </th>
                            <th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                                Started
                            </th>
                            <th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                                Finished
                            </th>
                        </tr>
                    </thead>
                    <tbody className='bg-white divide-y divide-gray-200'>
                        {submissions.items.map((submission) => {
                            const key = `${submission.accession}.${submission.version}`;
                            const isSelected = selectedSubmissions.has(key);

                            return (
                                <tr key={key} className={isSelected ? 'bg-primary-50' : ''}>
                                    <td className='px-3 py-4'>
                                        <input
                                            type='checkbox'
                                            checked={isSelected}
                                            onChange={(e) => onSelectionChange(key, e.target.checked)}
                                            className='h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded'
                                        />
                                    </td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900'>
                                        {submission.accession}.{submission.version}
                                    </td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{submission.organism}</td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{submission.group_id}</td>
                                    <td className='px-6 py-4 whitespace-nowrap'>
                                        <StatusBadge status={submission.status_all} />
                                    </td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                        {new Date(submission.started_at).toLocaleString()}
                                    </td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                        {submission.finished_at !== null ? new Date(submission.finished_at).toLocaleString() : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className='flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4'>
                <div className='flex flex-1 justify-between sm:hidden'>
                    <button
                        type='button'
                        onClick={() => onPageChange(submissions.page - 1)}
                        disabled={submissions.page === 0}
                        className='relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                        Previous
                    </button>
                    <button
                        type='button'
                        onClick={() => onPageChange(submissions.page + 1)}
                        disabled={submissions.page >= submissions.pages - 1}
                        className='relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                    >
                        Next
                    </button>
                </div>
                <div className='hidden sm:flex sm:flex-1 sm:items-center sm:justify-between'>
                    <div>
                        <p className='text-sm text-gray-700'>
                            Showing <span className='font-medium'>{submissions.page * submissions.size + 1}</span> to{' '}
                            <span className='font-medium'>{Math.min((submissions.page + 1) * submissions.size, submissions.total)}</span> of{' '}
                            <span className='font-medium'>{submissions.total}</span> results
                        </p>
                    </div>
                    <div>
                        <nav className='isolate inline-flex -space-x-px rounded-md shadow-sm' aria-label='Pagination'>
                            <button
                                type='button'
                                onClick={() => onPageChange(submissions.page - 1)}
                                disabled={submissions.page === 0}
                                className='relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                <span className='sr-only'>Previous</span>
                                &larr;
                            </button>
                            <span className='relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300'>
                                Page {submissions.page + 1} of {submissions.pages}
                            </span>
                            <button
                                type='button'
                                onClick={() => onPageChange(submissions.page + 1)}
                                disabled={submissions.page >= submissions.pages - 1}
                                className='relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed'
                            >
                                <span className='sr-only'>Next</span>
                                &rarr;
                            </button>
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
};
