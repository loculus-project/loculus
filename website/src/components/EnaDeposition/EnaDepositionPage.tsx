import { type FC, useState, useEffect, useCallback } from 'react';

import { ErrorManagement } from './ErrorManagement';
import { JsonPreviewModal } from './JsonPreviewModal';
import { SubmissionTable } from './SubmissionTable';
import { EnaDepositionClient } from '../../services/enaDepositionClient';
import type { PaginatedErrors, PaginatedSubmissions, SubmitItem } from '../../types/enaDeposition';

interface Props {
    enaDepositionUrl: string;
}

type ActiveTab = 'submissions' | 'errors';

export const EnaDepositionPage: FC<Props> = ({ enaDepositionUrl }) => {
    const [client] = useState(() => EnaDepositionClient.create(enaDepositionUrl));
    const [activeTab, setActiveTab] = useState<ActiveTab>('submissions');

    // Submissions state
    const [submissions, setSubmissions] = useState<PaginatedSubmissions | null>(null);
    const [submissionsLoading, setSubmissionsLoading] = useState(true);
    const [submissionsError, setSubmissionsError] = useState<string | null>(null);
    const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set());
    const [submissionFilters, setSubmissionFilters] = useState({
        status: '',
        organism: '',
        page: 0,
        size: 20,
    });

    // Errors state
    const [errors, setErrors] = useState<PaginatedErrors | null>(null);
    const [errorsLoading, setErrorsLoading] = useState(false);
    const [errorsError, setErrorsError] = useState<string | null>(null);
    const [errorFilters, setErrorFilters] = useState({
        table: '',
        organism: '',
        page: 0,
        size: 20,
    });

    // Modal state
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    // Fetch submissions
    const fetchSubmissions = useCallback(async () => {
        setSubmissionsLoading(true);
        setSubmissionsError(null);

        const result = await client.getSubmissions({
            status: submissionFilters.status || undefined,
            organism: submissionFilters.organism || undefined,
            page: submissionFilters.page,
            size: submissionFilters.size,
        });

        result.match(
            (data) => {
                setSubmissions(data);
                setSubmissionsLoading(false);
            },
            (error) => {
                setSubmissionsError(error.detail || 'Failed to load submissions');
                setSubmissionsLoading(false);
            },
        );
    }, [client, submissionFilters]);

    // Fetch errors
    const fetchErrors = useCallback(async () => {
        setErrorsLoading(true);
        setErrorsError(null);

        const result = await client.getErrors({
            table: errorFilters.table || undefined,
            organism: errorFilters.organism || undefined,
            page: errorFilters.page,
            size: errorFilters.size,
        });

        result.match(
            (data) => {
                setErrors(data);
                setErrorsLoading(false);
            },
            (error) => {
                setErrorsError(error.detail || 'Failed to load errors');
                setErrorsLoading(false);
            },
        );
    }, [client, errorFilters]);

    // Initial load and polling
    useEffect(() => {
        void fetchSubmissions();
    }, [fetchSubmissions]);

    useEffect(() => {
        if (activeTab === 'errors') {
            void fetchErrors();
        }
    }, [activeTab, fetchErrors]);

    // Poll for updates every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (activeTab === 'submissions') {
                void fetchSubmissions();
            } else {
                void fetchErrors();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [activeTab, fetchSubmissions, fetchErrors]);

    // Handle submission selection
    const handleSelectionChange = (accessionVersion: string, selected: boolean) => {
        setSelectedSubmissions((prev) => {
            const next = new Set(prev);
            if (selected) {
                next.add(accessionVersion);
            } else {
                next.delete(accessionVersion);
            }
            return next;
        });
    };

    const handleSelectAll = (selected: boolean) => {
        if (selected && submissions) {
            const all = new Set(submissions.items.map((s) => `${s.accession}.${s.version}`));
            setSelectedSubmissions(all);
        } else {
            setSelectedSubmissions(new Set());
        }
    };

    // Handle submit
    const handleSubmit = async (items: SubmitItem[]) => {
        const result = await client.submitToEna(items);

        result.match(
            (response) => {
                if (response.submitted.length > 0) {
                    setSelectedSubmissions(new Set());
                    void fetchSubmissions();
                }
                setShowPreviewModal(false);

                if (response.errors.length > 0) {
                    // eslint-disable-next-line no-alert
                    alert(`Some submissions failed:\n${response.errors.map((e) => `${e.accession}.${e.version}: ${e.message}`).join('\n')}`);
                }
            },
            (error) => {
                // eslint-disable-next-line no-alert
                alert(`Failed to submit: ${error.detail}`);
            },
        );
    };

    // Handle retry
    const handleRetry = async (accession: string, version: number) => {
        const result = await client.retrySubmission(accession, version);

        result.match(
            () => {
                void fetchErrors();
                void fetchSubmissions();
            },
            (error) => {
                // eslint-disable-next-line no-alert
                alert(`Failed to retry: ${error.detail}`);
            },
        );
    };

    const errorCount = errors?.total ?? 0;

    return (
        <div>
            {/* Tab Navigation */}
            <div className='border-b border-gray-200 mb-6'>
                <nav className='-mb-px flex space-x-8'>
                    <button
                        type='button'
                        onClick={() => setActiveTab('submissions')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'submissions'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        All Submissions
                    </button>
                    <button
                        type='button'
                        onClick={() => setActiveTab('errors')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'errors'
                                ? 'border-primary-500 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Errors
                        {errorCount > 0 && (
                            <span className='ml-2 bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded'>
                                {errorCount}
                            </span>
                        )}
                    </button>
                </nav>
            </div>

            {/* Content */}
            {activeTab === 'submissions' ? (
                <div>
                    {/* Filters */}
                    <div className='flex gap-4 mb-4'>
                        <div>
                            <label htmlFor='status-filter' className='block text-sm font-medium text-gray-700'>
                                Status
                            </label>
                            <select
                                id='status-filter'
                                value={submissionFilters.status}
                                onChange={(e) => setSubmissionFilters((f) => ({ ...f, status: e.target.value, page: 0 }))}
                                className='mt-1 block w-48 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm'
                            >
                                <option value=''>All statuses</option>
                                <option value='READY_TO_SUBMIT'>Ready to Submit</option>
                                <option value='SUBMITTING_PROJECT'>Submitting Project</option>
                                <option value='SUBMITTED_PROJECT'>Submitted Project</option>
                                <option value='SUBMITTING_SAMPLE'>Submitting Sample</option>
                                <option value='SUBMITTED_SAMPLE'>Submitted Sample</option>
                                <option value='SUBMITTING_ASSEMBLY'>Submitting Assembly</option>
                                <option value='SUBMITTED_ALL'>Submitted All</option>
                                <option value='SENT_TO_LOCULUS'>Sent to Loculus</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor='organism-filter' className='block text-sm font-medium text-gray-700'>
                                Organism
                            </label>
                            <input
                                id='organism-filter'
                                type='text'
                                value={submissionFilters.organism}
                                onChange={(e) => setSubmissionFilters((f) => ({ ...f, organism: e.target.value, page: 0 }))}
                                placeholder='Filter by organism'
                                className='mt-1 block w-48 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm'
                            />
                        </div>
                        <div className='flex items-end'>
                            <button
                                type='button'
                                onClick={() => void fetchSubmissions()}
                                className='px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm'
                            >
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className='mb-4'>
                        <button
                            type='button'
                            onClick={() => setShowPreviewModal(true)}
                            disabled={selectedSubmissions.size === 0}
                            className='px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm'
                        >
                            Preview Selected ({selectedSubmissions.size})
                        </button>
                    </div>

                    {/* Table */}
                    {submissionsLoading ? (
                        <div className='text-center py-8 text-gray-500'>Loading...</div>
                    ) : submissionsError !== null ? (
                        <div className='bg-red-50 border border-red-200 rounded-md p-4 text-red-800'>{submissionsError}</div>
                    ) : submissions !== null ? (
                        <SubmissionTable
                            submissions={submissions}
                            selectedSubmissions={selectedSubmissions}
                            onSelectionChange={handleSelectionChange}
                            onSelectAll={handleSelectAll}
                            onPageChange={(page) => setSubmissionFilters((f) => ({ ...f, page }))}
                        />
                    ) : null}
                </div>
            ) : (
                <ErrorManagement
                    errors={errors}
                    loading={errorsLoading}
                    error={errorsError}
                    filters={errorFilters}
                    onFiltersChange={setErrorFilters}
                    onRefresh={() => void fetchErrors()}
                    onRetry={handleRetry}
                />
            )}

            {/* Preview Modal */}
            {showPreviewModal && (
                <JsonPreviewModal
                    accessions={Array.from(selectedSubmissions)}
                    client={client}
                    onClose={() => setShowPreviewModal(false)}
                    onSubmit={handleSubmit}
                />
            )}
        </div>
    );
};
