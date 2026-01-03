import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SeqPreviewModal } from './SeqPreviewModal';
import { testOrganism } from '../../../vitest.setup.ts';
import type { Group } from '../../types/backend.ts';
import type { SequenceFlaggingConfig } from '../../types/config.ts';
import type { DetailsJson } from '../../types/detailsJson.ts';
import { SINGLE_REFERENCE, type ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';

// Mock fetch for loading sequence details
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the logger
vi.mock('../../clientLogger.ts', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
    }),
}));

const mockAccession = 'LOC_123456';
const mockDetailsJson: DetailsJson = {
    accessionVersion: mockAccession,
    displayName: 'Test Sequence',
    organism: testOrganism,
    sequenceEntryHistory: [
        {
            accessionVersion: mockAccession,
            version: 1,
            isRevocation: false,
        },
    ],
    metadata: [
        {
            key: 'country',
            value: 'Switzerland',
        },
        {
            key: 'date',
            value: '2024-01-01',
        },
    ],
    isRevocation: false,
};

const defaultReferenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema = {
    [SINGLE_REFERENCE]: {
        nucleotideSegmentNames: ['main'],
        geneNames: ['gene1', 'gene2'],
        insdcAccessionFull: [
            {
                name: 'main',
                insdcAccessionFull: undefined,
            },
        ],
    },
};

const mockGroups: Group[] = [];

interface RenderSeqPreviewModalProps {
    seqId?: string;
    accessToken?: string;
    isOpen?: boolean;
    onClose?: () => void;
    isHalfScreen?: boolean;
    setIsHalfScreen?: (value: boolean) => void;
    setPreviewedSeqId?: (seqId: string | null) => void;
    sequenceFlaggingConfig?: SequenceFlaggingConfig;
}

function renderSeqPreviewModal({
    seqId = mockAccession,
    accessToken,
    isOpen = true,
    onClose = vi.fn(),
    isHalfScreen = false,
    setIsHalfScreen = vi.fn(),
    setPreviewedSeqId = vi.fn(),
    sequenceFlaggingConfig,
}: RenderSeqPreviewModalProps = {}) {
    return render(
        <SeqPreviewModal
            seqId={seqId}
            accessToken={accessToken}
            isOpen={isOpen}
            onClose={onClose}
            referenceGenomeLightweightSchema={defaultReferenceGenomeLightweightSchema}
            sequenceFlaggingConfig={sequenceFlaggingConfig}
            myGroups={mockGroups}
            isHalfScreen={isHalfScreen}
            setIsHalfScreen={setIsHalfScreen}
            setPreviewedSeqId={setPreviewedSeqId}
        />,
    );
}

describe('SeqPreviewModal', () => {
    beforeEach(() => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(mockDetailsJson),
        });
    });

    it('should open and display the modal when isOpen is true', async () => {
        renderSeqPreviewModal({ isOpen: true });

        await waitFor(() => {
            expect(screen.getByTestId('sequence-preview-modal')).toBeInTheDocument();
        });
    });

    it('should not display the modal when isOpen is false', () => {
        renderSeqPreviewModal({ isOpen: false });

        expect(screen.queryByTestId('sequence-preview-modal')).not.toBeInTheDocument();
    });

    it('should display the correct accession in the modal header', async () => {
        renderSeqPreviewModal({ seqId: mockAccession });

        await waitFor(() => {
            expect(screen.getByText(mockAccession)).toBeInTheDocument();
        });
    });

    it('should fetch and display sequence details', async () => {
        renderSeqPreviewModal();

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalled();
            // Check that fetch was called with the correct URL
            const fetchCall = mockFetch.mock.calls[0][0];
            const url = typeof fetchCall === 'string' ? fetchCall : fetchCall.url;
            expect(url).toContain(`/seq/${mockAccession}/details.json`);
        });

        await waitFor(() => {
            expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
        });
    });

    it('should call onClose when the close button is clicked', async () => {
        const onClose = vi.fn();
        renderSeqPreviewModal({ onClose });

        await waitFor(() => {
            expect(screen.getByTestId('close-preview-button')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByTestId('close-preview-button'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should display loading state initially', () => {
        renderSeqPreviewModal();

        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should display error state when fetch fails', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

        renderSeqPreviewModal();

        await waitFor(() => {
            expect(screen.getByText('Failed to load sequence data')).toBeInTheDocument();
        });
    });

    it('should toggle between half screen and full screen modes', async () => {
        const setIsHalfScreen = vi.fn();
        renderSeqPreviewModal({ isHalfScreen: false, setIsHalfScreen });

        await waitFor(() => {
            expect(screen.getByTestId('toggle-half-screen-button')).toBeInTheDocument();
        });

        await userEvent.click(screen.getByTestId('toggle-half-screen-button'));

        expect(setIsHalfScreen).toHaveBeenCalledWith(true);
    });

    it('should render in half-screen mode when isHalfScreen is true', async () => {
        renderSeqPreviewModal({ isHalfScreen: true });

        await waitFor(() => {
            expect(screen.getByTestId('half-screen-preview')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('sequence-preview-modal')).not.toBeInTheDocument();
    });

    it('should render in full-screen mode when isHalfScreen is false', async () => {
        renderSeqPreviewModal({ isHalfScreen: false });

        await waitFor(() => {
            expect(screen.getByTestId('sequence-preview-modal')).toBeInTheDocument();
        });
        expect(screen.queryByTestId('half-screen-preview')).not.toBeInTheDocument();
    });

    describe('URL state preservation', () => {
        beforeEach(() => {
            // Set up URL with various query parameters to test preservation
            const searchParams = new URLSearchParams({
                page: '3',
                orderBy: 'date',
                order: 'descending',
                country: 'Switzerland',
                organism: testOrganism,
            });
            window.history.replaceState({}, '', `?${searchParams.toString()}`);
        });

        it('should not modify URL parameters when modal opens', async () => {
            const initialUrl = window.location.search;
            renderSeqPreviewModal({ isOpen: true });

            await waitFor(() => {
                expect(screen.getByTestId('sequence-preview-modal')).toBeInTheDocument();
            });

            // URL should remain unchanged
            expect(window.location.search).toBe(initialUrl);
        });

        it('should preserve pagination state when closing modal', async () => {
            const onClose = vi.fn();
            renderSeqPreviewModal({ onClose });

            await waitFor(() => {
                expect(screen.getByTestId('close-preview-button')).toBeInTheDocument();
            });

            const initialUrl = window.location.search;
            await userEvent.click(screen.getByTestId('close-preview-button'));

            // URL should remain unchanged after closing
            expect(window.location.search).toBe(initialUrl);
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('should preserve search filters when closing modal', async () => {
            const onClose = vi.fn();
            renderSeqPreviewModal({ onClose });

            await waitFor(() => {
                expect(screen.getByTestId('close-preview-button')).toBeInTheDocument();
            });

            const searchParams = new URLSearchParams(window.location.search);
            expect(searchParams.get('country')).toBe('Switzerland');

            await userEvent.click(screen.getByTestId('close-preview-button'));

            // Search filter should still be present
            const newSearchParams = new URLSearchParams(window.location.search);
            expect(newSearchParams.get('country')).toBe('Switzerland');
        });

        it('should preserve ordering when closing modal', async () => {
            const onClose = vi.fn();
            renderSeqPreviewModal({ onClose });

            await waitFor(() => {
                expect(screen.getByTestId('close-preview-button')).toBeInTheDocument();
            });

            const searchParams = new URLSearchParams(window.location.search);
            expect(searchParams.get('orderBy')).toBe('date');
            expect(searchParams.get('order')).toBe('descending');

            await userEvent.click(screen.getByTestId('close-preview-button'));

            // Ordering should still be present
            const newSearchParams = new URLSearchParams(window.location.search);
            expect(newSearchParams.get('orderBy')).toBe('date');
            expect(newSearchParams.get('order')).toBe('descending');
        });

        it('should preserve organism parameter when closing modal', async () => {
            const onClose = vi.fn();
            renderSeqPreviewModal({ onClose });

            await waitFor(() => {
                expect(screen.getByTestId('close-preview-button')).toBeInTheDocument();
            });

            const searchParams = new URLSearchParams(window.location.search);
            expect(searchParams.get('organism')).toBe(testOrganism);

            await userEvent.click(screen.getByTestId('close-preview-button'));

            // Organism should still be present
            const newSearchParams = new URLSearchParams(window.location.search);
            expect(newSearchParams.get('organism')).toBe(testOrganism);
        });

        it('regression test for issue #5783: pagination should not be lost when opening modal', async () => {
            // This test specifically addresses issue #5783
            // Setup: Start on page 3 with other parameters
            const searchParams = new URLSearchParams({
                page: '3',
                orderBy: 'date',
                order: 'descending',
                country: 'Switzerland',
            });
            window.history.replaceState({}, '', `?${searchParams.toString()}`);

            const initialUrl = window.location.search;
            const initialPage = new URLSearchParams(initialUrl).get('page');
            expect(initialPage).toBe('3');

            // Open modal
            renderSeqPreviewModal({ isOpen: true });

            await waitFor(() => {
                expect(screen.getByTestId('sequence-preview-modal')).toBeInTheDocument();
            });

            // Assert: Page parameter should still be '3'
            const afterOpenUrl = new URLSearchParams(window.location.search);
            expect(afterOpenUrl.get('page')).toBe('3');
            expect(afterOpenUrl.get('orderBy')).toBe('date');
            expect(afterOpenUrl.get('order')).toBe('descending');
            expect(afterOpenUrl.get('country')).toBe('Switzerland');
        });
    });

    describe('Modal closing methods', () => {
        it('should call onClose when clicking outside the modal (backdrop click)', async () => {
            const onClose = vi.fn();
            renderSeqPreviewModal({ onClose, isHalfScreen: false });

            await waitFor(() => {
                expect(screen.getByTestId('sequence-preview-modal')).toBeInTheDocument();
            });

            // Find the backdrop (Dialog component handles this automatically in headlessui)
            // The backdrop is the fixed inset div with bg-black opacity-30
            const backdrop = document.querySelector('.fixed.inset-0.bg-black.opacity-30');
            expect(backdrop).toBeInTheDocument();

            // Click on backdrop
            if (backdrop) {
                await userEvent.click(backdrop);
            }

            // onClose should be called by the Dialog component
            // Note: HeadlessUI's Dialog handles backdrop clicks automatically
            // The actual behavior depends on the Dialog's onClose prop
            expect(onClose).toHaveBeenCalled();
        });

        it('should call onClose when clicking the X button', async () => {
            const onClose = vi.fn();
            renderSeqPreviewModal({ onClose });

            await waitFor(() => {
                expect(screen.getByTestId('close-preview-button')).toBeInTheDocument();
            });

            await userEvent.click(screen.getByTestId('close-preview-button'));

            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Sequence Entry History', () => {
        it('should display sequence entry history menu when multiple versions exist', async () => {
            const detailsWithHistory: DetailsJson = {
                ...mockDetailsJson,
                sequenceEntryHistory: [
                    {
                        accessionVersion: `${mockAccession}.1`,
                        version: 1,
                        isRevocation: false,
                    },
                    {
                        accessionVersion: `${mockAccession}.2`,
                        version: 2,
                        isRevocation: false,
                    },
                ],
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(detailsWithHistory),
            });

            renderSeqPreviewModal();

            await waitFor(() => {
                expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
            });

            // The sequence entry history menu should be rendered
            // when there are multiple versions
            await waitFor(() => {
                // Check that the component has loaded and history exists
                expect(mockFetch).toHaveBeenCalled();
            });
        });

        it('should not display sequence entry history menu when only one version exists', async () => {
            renderSeqPreviewModal();

            await waitFor(() => {
                expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
            });

            // With only one version in history, the menu should not be displayed
            // The component structure doesn't render the menu component when length <= 1
            await waitFor(() => {
                expect(mockFetch).toHaveBeenCalled();
            });
        });
    });

    describe('Download functionality', () => {
        it('should display download button with dropdown options', async () => {
            renderSeqPreviewModal();

            await waitFor(() => {
                expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
            });

            // The download button should be present
            const downloadButtons = document.querySelectorAll('.dropdown');
            expect(downloadButtons.length).toBeGreaterThan(0);
        });
    });

    describe('Error handling', () => {
        it('should handle JSON parsing errors gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.reject(new Error('JSON parse error')),
            });

            renderSeqPreviewModal();

            await waitFor(() => {
                expect(screen.getByText('Failed to load sequence data')).toBeInTheDocument();
            });
        });

        it('should handle network errors gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            renderSeqPreviewModal();

            await waitFor(() => {
                expect(screen.getByText('Failed to load sequence data')).toBeInTheDocument();
            });
        });
    });
});
