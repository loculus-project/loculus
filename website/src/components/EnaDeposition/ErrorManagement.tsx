import { type FC } from 'react';

import { StatusBadge } from './StatusBadge';
import type { PaginatedErrors, SubmissionStatusAll } from '../../types/enaDeposition';

interface ErrorFilters {
    table: string;
    organism: string;
    page: number;
    size: number;
}

interface Props {
    errors: PaginatedErrors | null;
    loading: boolean;
    error: string | null;
    filters: ErrorFilters;
    onFiltersChange: (filters: ErrorFilters) => void;
    onRefresh: () => void;
    onRetry: (accession: string, version: number) => void;
}

export const ErrorManagement: FC<Props> = ({ errors, loading, error, filters, onFiltersChange, onRefresh, onRetry }) => {
    return (
        <div>
            {/* Filters */}
            <div className='flex gap-4 mb-4'>
                <div>
                    <label htmlFor='table-filter' className='block text-sm font-medium text-gray-700'>
                        Error Type
                    </label>
                    <select
                        id='table-filter'
                        value={filters.table}
                        onChange={(e) => onFiltersChange({ ...filters, table: e.target.value, page: 0 })}
                        className='mt-1 block w-48 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm'
                    >
                        <option value=''>All types</option>
                        <option value='project'>Project errors</option>
                        <option value='sample'>Sample errors</option>
                        <option value='assembly'>Assembly errors</option>
                    </select>
                </div>
                <div>
                    <label htmlFor='error-organism-filter' className='block text-sm font-medium text-gray-700'>
                        Organism
                    </label>
                    <input
                        id='error-organism-filter'
                        type='text'
                        value={filters.organism}
                        onChange={(e) => onFiltersChange({ ...filters, organism: e.target.value, page: 0 })}
                        placeholder='Filter by organism'
                        className='mt-1 block w-48 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm'
                    />
                </div>
                <div className='flex items-end'>
                    <button
                        type='button'
                        onClick={onRefresh}
                        className='px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm'
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className='text-center py-8 text-gray-500'>Loading...</div>
            ) : error !== null ? (
                <div className='bg-red-50 border border-red-200 rounded-md p-4 text-red-800'>{error}</div>
            ) : errors !== null && errors.items.length === 0 ? (
                <div className='text-center py-8 text-gray-500'>No errors found</div>
            ) : errors !== null ? (
                <div className='space-y-4'>
                    {errors.items.map((item) => (
                        <div key={`${item.accession}.${item.version}`} className='bg-white border border-gray-200 rounded-lg p-4'>
                            <div className='flex items-start justify-between'>
                                <div>
                                    <div className='flex items-center gap-2'>
                                        <span className='font-medium text-gray-900'>
                                            {item.accession}.{item.version}
                                        </span>
                                        <StatusBadge status={item.status as SubmissionStatusAll} />
                                    </div>
                                    <div className='text-sm text-gray-500 mt-1'>
                                        {item.organism} &middot; Group {item.group_id} &middot; Started{' '}
                                        {new Date(item.started_at).toLocaleString()}
                                    </div>
                                    <div className='mt-2'>
                                        <div className='text-sm font-medium text-gray-700'>Errors:</div>
                                        <ul className='mt-1 text-sm text-red-700 list-disc list-inside'>
                                            {item.error_messages.map((msg, idx) => (
                                                <li key={idx}>{msg}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <div className='flex gap-2'>
                                    {item.can_retry && (
                                        <button
                                            type='button'
                                            onClick={() => onRetry(item.accession, item.version)}
                                            className='px-3 py-1 bg-primary-500 text-white rounded-md hover:bg-primary-600 text-sm'
                                        >
                                            Retry
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Pagination */}
                    {errors.pages > 1 && (
                        <div className='flex items-center justify-between border-t border-gray-200 pt-4'>
                            <div className='text-sm text-gray-700'>
                                Page {errors.page + 1} of {errors.pages} ({errors.total} total)
                            </div>
                            <div className='flex gap-2'>
                                <button
                                    type='button'
                                    onClick={() => onFiltersChange({ ...filters, page: filters.page - 1 })}
                                    disabled={filters.page === 0}
                                    className='px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                                >
                                    Previous
                                </button>
                                <button
                                    type='button'
                                    onClick={() => onFiltersChange({ ...filters, page: filters.page + 1 })}
                                    disabled={filters.page >= errors.pages - 1}
                                    className='px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed'
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
};
