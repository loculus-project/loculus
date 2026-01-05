import { type FC } from 'react';

import type { PaginatedReadyToSubmit } from '../../types/enaDeposition';

interface Props {
    data: PaginatedReadyToSubmit;
    selectedItems: Set<string>;
    onSelectionChange: (accessionVersion: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
    onPageChange: (page: number) => void;
}

export const ReadyToSubmitTable: FC<Props> = ({ data, selectedItems, onSelectionChange, onSelectAll, onPageChange }) => {
    const allSelected = data.items.length > 0 && data.items.every((s) => selectedItems.has(`${s.accession}.${s.version}`));

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
                            <th
                                scope='col'
                                className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                            >
                                Accession
                            </th>
                            <th
                                scope='col'
                                className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                            >
                                Organism
                            </th>
                            <th
                                scope='col'
                                className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                            >
                                Group
                            </th>
                            <th
                                scope='col'
                                className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'
                            >
                                Submitted Date
                            </th>
                        </tr>
                    </thead>
                    <tbody className='bg-white divide-y divide-gray-200'>
                        {data.items.map((item) => {
                            const key = `${item.accession}.${item.version}`;
                            const isSelected = selectedItems.has(key);

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
                                        {item.accession}.{item.version}
                                    </td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>{item.organism}</td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                        {item.group_name || item.group_id}
                                    </td>
                                    <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                        {item.submitted_date ? new Date(item.submitted_date).toLocaleDateString() : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                        {data.items.length === 0 && (
                            <tr>
                                <td colSpan={5} className='px-6 py-8 text-center text-gray-500'>
                                    No sequences ready for ENA submission
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data.total > 0 && (
                <div className='flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4'>
                    <div className='flex flex-1 justify-between sm:hidden'>
                        <button
                            type='button'
                            onClick={() => onPageChange(data.page - 1)}
                            disabled={data.page === 0}
                            className='relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Previous
                        </button>
                        <button
                            type='button'
                            onClick={() => onPageChange(data.page + 1)}
                            disabled={data.page >= data.pages - 1}
                            className='relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                        >
                            Next
                        </button>
                    </div>
                    <div className='hidden sm:flex sm:flex-1 sm:items-center sm:justify-between'>
                        <div>
                            <p className='text-sm text-gray-700'>
                                Showing <span className='font-medium'>{data.page * data.size + 1}</span> to{' '}
                                <span className='font-medium'>{Math.min((data.page + 1) * data.size, data.total)}</span> of{' '}
                                <span className='font-medium'>{data.total}</span> results
                            </p>
                        </div>
                        <div>
                            <nav className='isolate inline-flex -space-x-px rounded-md shadow-sm' aria-label='Pagination'>
                                <button
                                    type='button'
                                    onClick={() => onPageChange(data.page - 1)}
                                    disabled={data.page === 0}
                                    className='relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed'
                                >
                                    <span className='sr-only'>Previous</span>
                                    &larr;
                                </button>
                                <span className='relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300'>
                                    Page {data.page + 1} of {data.pages}
                                </span>
                                <button
                                    type='button'
                                    onClick={() => onPageChange(data.page + 1)}
                                    disabled={data.page >= data.pages - 1}
                                    className='relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed'
                                >
                                    <span className='sr-only'>Next</span>
                                    &rarr;
                                </button>
                            </nav>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
