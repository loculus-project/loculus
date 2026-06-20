import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { useState, useCallback } from 'react';

import { pageSize } from '../../settings';
import type { Metadata } from '../../types/config';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { Button } from '../common/Button';

const queryClient = new QueryClient();

type CrossOrganismSearchProps = {
    clientConfig: ClientConfig;
    sharedMetadata: Metadata[];
    hiddenFieldValues: Record<string, string>;
    organisms: string[];
};

type SequenceRow = Record<string, unknown>;

const cellValue = (val: unknown): string => {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
    if (typeof val === 'object') return JSON.stringify(val);
    return '';
};

export const CrossOrganismSearch = (props: CrossOrganismSearchProps) => (
    <QueryClientProvider client={queryClient}>
        <CrossOrganismSearchInner {...props} />
    </QueryClientProvider>
);

const CrossOrganismSearchInner = ({
    clientConfig,
    sharedMetadata,
    hiddenFieldValues,
    organisms,
}: CrossOrganismSearchProps) => {
    const [rows, setRows] = useState<SequenceRow[]>([]);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const queryUrl = `${clientConfig.backendUrl}/query`;

    const searchParams = { ...hiddenFieldValues };
    const sharedFieldNames = sharedMetadata.map((f) => f.name);
    const displayFields = ['organism', ...sharedFieldNames];

    const fetchData = useCallback(
        async (p: number) => {
            setIsLoading(true);
            setError(null);
            try {
                const [detailsResp, aggResp] = await Promise.all([
                    axios.post(`${queryUrl}/details`, {
                        ...searchParams,
                        fields: ['accessionVersion', ...displayFields],
                        limit: pageSize,
                        offset: (p - 1) * pageSize,
                    }),
                    axios.post(`${queryUrl}/aggregated`, {
                        ...searchParams,
                        fields: [],
                    }),
                ]);
                setRows((detailsResp.data as { data: SequenceRow[] }).data);
                setTotalCount((aggResp.data as { data: { count: number }[] }).data[0]?.count ?? 0);
                setPage(p);
            } catch (e) {
                setError(String(e));
            } finally {
                setIsLoading(false);
            }
        },
        [queryUrl, JSON.stringify(searchParams)],
    );

    const buildDownloadUrl = (type: 'metadata' | 'unalignedNucleotideSequences', organism?: string) => {
        const params = new URLSearchParams({
            ...searchParams,
            downloadAsFile: 'true',
            dataFormat: type === 'metadata' ? 'tsv' : 'fasta',
        });
        if (type === 'metadata') {
            params.set('fields', ['accessionVersion', ...displayFields].join(','));
            return `${queryUrl}/details?${params}`;
        }
        if (organism) {
            params.set('organism', organism);
            return `${queryUrl}/unalignedNucleotideSequences?${params}`;
        }
        return null;
    };

    return (
        <div className='p-4'>
            <h1 className='text-2xl font-bold mb-4'>Browse all organisms</h1>
            <p className='text-gray-600 mb-6 text-sm'>
                Search across all organisms. Only shared metadata fields are shown. Download of aligned sequences is not
                available in this view.
            </p>

            <div className='mb-4 flex gap-2'>
                <Button
                    className='px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50'
                    onClick={() => void fetchData(1)}
                    disabled={isLoading}
                >
                    {isLoading ? 'Searching…' : 'Search'}
                </Button>
            </div>

            {error && <div className='text-red-600 mb-4 text-sm'>{error}</div>}

            {totalCount !== null && (
                <p className='text-sm text-gray-600 mb-3'>
                    {totalCount.toLocaleString()} sequence{totalCount !== 1 ? 's' : ''} found
                </p>
            )}

            {/* Download buttons */}
            {totalCount !== null && totalCount > 0 && (
                <div className='mb-4 flex flex-wrap gap-2'>
                    <a
                        href={buildDownloadUrl('metadata') ?? '#'}
                        className='px-3 py-1.5 text-sm border border-primary-600 text-primary-600 rounded hover:bg-primary-50'
                    >
                        Download metadata (TSV)
                    </a>
                    {organisms.map((organism) => (
                        <a
                            key={organism}
                            href={buildDownloadUrl('unalignedNucleotideSequences', organism) ?? '#'}
                            className='px-3 py-1.5 text-sm border border-primary-600 text-primary-600 rounded hover:bg-primary-50'
                        >
                            Download {organism} sequences (FASTA)
                        </a>
                    ))}
                    <span
                        className='px-3 py-1.5 text-sm border border-gray-300 text-gray-400 rounded cursor-not-allowed'
                        title='Aligned sequences are not available in the cross-organism view'
                    >
                        Aligned sequences (not available)
                    </span>
                </div>
            )}

            {/* Results table */}
            {rows.length > 0 && (
                <div className='overflow-x-auto'>
                    <table className='min-w-full text-sm border-collapse'>
                        <thead>
                            <tr className='bg-gray-100'>
                                {displayFields.map((col) => (
                                    <th key={col} className='px-3 py-2 text-left font-medium text-gray-700 border-b'>
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i} className='border-b hover:bg-gray-50'>
                                    {displayFields.map((col) => (
                                        <td key={col} className='px-3 py-1.5 text-gray-900 max-w-xs truncate'>
                                            {cellValue(row[col])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalCount !== null && totalCount > pageSize && (
                        <div className='flex gap-2 mt-4'>
                            <Button
                                className='px-3 py-1 border rounded disabled:opacity-40'
                                onClick={() => void fetchData(page - 1)}
                                disabled={page <= 1 || isLoading}
                            >
                                Previous
                            </Button>
                            <span className='px-3 py-1 text-sm text-gray-600'>
                                Page {page} / {Math.ceil(totalCount / pageSize)}
                            </span>
                            <Button
                                className='px-3 py-1 border rounded disabled:opacity-40'
                                onClick={() => void fetchData(page + 1)}
                                disabled={page * pageSize >= totalCount || isLoading}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
