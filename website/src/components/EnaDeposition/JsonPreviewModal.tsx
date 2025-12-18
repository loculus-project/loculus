import { type FC, useState, useEffect, useCallback } from 'react';

import type { EnaDepositionClient } from '../../services/enaDepositionClient';
import type { SubmissionPreviewItem, SubmitItem } from '../../types/enaDeposition';

interface Props {
    accessions: string[];
    client: EnaDepositionClient;
    onClose: () => void;
    onSubmit: (items: SubmitItem[]) => void;
}

export const JsonPreviewModal: FC<Props> = ({ accessions, client, onClose, onSubmit }) => {
    const [previews, setPreviews] = useState<SubmissionPreviewItem[]>([]);
    const [editedJson, setEditedJson] = useState<Record<string, string>>({});
    const [activeIndex, setActiveIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const fetchPreviews = useCallback(async () => {
        setLoading(true);
        setError(null);

        const result = await client.generatePreview(accessions);

        result.match(
            (response) => {
                setPreviews(response.previews);
                // Initialize edited JSON with original data
                const initial: Record<string, string> = {};
                response.previews.forEach((p) => {
                    const key = `${p.accession}.${p.version}`;
                    initial[key] = JSON.stringify(
                        {
                            accession: p.accession,
                            version: p.version,
                            organism: p.organism,
                            group_id: p.group_id,
                            metadata: p.metadata,
                            unaligned_nucleotide_sequences: p.unaligned_nucleotide_sequences,
                        },
                        null,
                        2,
                    );
                });
                setEditedJson(initial);
                setLoading(false);
            },
            (err) => {
                setError(err.detail || 'Failed to generate preview');
                setLoading(false);
            },
        );
    }, [client, accessions]);

    useEffect(() => {
        void fetchPreviews();
    }, [fetchPreviews]);

    const handleSubmit = () => {
        setSubmitting(true);

        try {
            const items: SubmitItem[] = Object.values(editedJson).map((json) => JSON.parse(json) as SubmitItem);
            onSubmit(items);
        } catch {
            // eslint-disable-next-line no-alert
            alert('Invalid JSON. Please check the format.');
            setSubmitting(false);
        }
    };

    const currentPreview = previews[activeIndex];
    const currentKey = currentPreview !== undefined ? `${currentPreview.accession}.${currentPreview.version}` : '';

    return (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
            <div className='bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col'>
                {/* Header */}
                <div className='px-6 py-4 border-b border-gray-200'>
                    <div className='flex items-center justify-between'>
                        <h2 className='text-lg font-semibold text-gray-900'>Preview ENA Submission ({previews.length} items)</h2>
                        <button type='button' onClick={onClose} className='text-gray-400 hover:text-gray-500'>
                            <span className='sr-only'>Close</span>
                            <svg className='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className='flex-1 overflow-hidden flex flex-col'>
                    {loading ? (
                        <div className='flex-1 flex items-center justify-center text-gray-500'>Loading previews...</div>
                    ) : error !== null ? (
                        <div className='p-6 bg-red-50 text-red-800'>{error}</div>
                    ) : (
                        <>
                            {/* Tabs */}
                            {previews.length > 1 && (
                                <div className='px-6 pt-4 border-b border-gray-200'>
                                    <nav className='-mb-px flex space-x-4 overflow-x-auto'>
                                        {previews.map((p, idx) => (
                                            <button
                                                key={`${p.accession}.${p.version}`}
                                                type='button'
                                                onClick={() => setActiveIndex(idx)}
                                                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                                                    idx === activeIndex
                                                        ? 'border-primary-500 text-primary-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                            >
                                                {p.accession}.{p.version}
                                                {p.validation_errors.length > 0 && (
                                                    <span className='ml-1 text-red-500'>!</span>
                                                )}
                                            </button>
                                        ))}
                                    </nav>
                                </div>
                            )}

                            {/* Validation errors */}
                            {currentPreview !== undefined && currentPreview.validation_errors.length > 0 && (
                                <div className='px-6 py-3 bg-red-50 border-b border-red-200'>
                                    <div className='text-sm font-medium text-red-800'>Validation Errors:</div>
                                    <ul className='mt-1 text-sm text-red-700 list-disc list-inside'>
                                        {currentPreview.validation_errors.map((err, idx) => (
                                            <li key={idx}>{err}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Validation warnings */}
                            {currentPreview !== undefined && currentPreview.validation_warnings.length > 0 && (
                                <div className='px-6 py-3 bg-yellow-50 border-b border-yellow-200'>
                                    <div className='text-sm font-medium text-yellow-800'>Warnings:</div>
                                    <ul className='mt-1 text-sm text-yellow-700 list-disc list-inside'>
                                        {currentPreview.validation_warnings.map((warn, idx) => (
                                            <li key={idx}>{warn}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* JSON Editor */}
                            <div className='flex-1 p-6 overflow-hidden'>
                                <div className='text-sm text-gray-500 mb-2'>Edit JSON before submission (optional):</div>
                                <textarea
                                    value={editedJson[currentKey] ?? ''}
                                    onChange={(e) => setEditedJson((prev) => ({ ...prev, [currentKey]: e.target.value }))}
                                    className='w-full h-96 font-mono text-sm border border-gray-300 rounded-md p-3 focus:ring-primary-500 focus:border-primary-500'
                                    spellCheck={false}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className='px-6 py-4 border-t border-gray-200 flex justify-end gap-3'>
                    <button
                        type='button'
                        onClick={onClose}
                        className='px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm'
                    >
                        Cancel
                    </button>
                    <button
                        type='button'
                        onClick={handleSubmit}
                        disabled={loading || error !== null || submitting}
                        className='px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm'
                    >
                        {submitting ? 'Submitting...' : 'Submit to ENA'}
                    </button>
                </div>
            </div>
        </div>
    );
};
