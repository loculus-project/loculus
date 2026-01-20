import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SequencesContainer } from './SequencesContainer.tsx';
import { mockRequest, testConfig, testOrganism } from '../../../../vitest.setup.ts';
import type { ReferenceGenomes } from '../../../types/referencesGenomes.ts';
import type { SegmentReferenceSelections } from '../../../utils/sequenceTypeHelpers.ts';
import {
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../../types/referenceGenomes.spec.ts';

vi.mock('../../config', () => ({
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy'),
}));

const queryClient = new QueryClient();
const accessionVersion = 'accession';

// CSS Classes
const TAB_ACTIVE_CLASS = 'tab-active';

// Button Labels
const LOAD_SEQUENCES_BUTTON = 'Load sequences';
const ALIGNED_NUCLEOTIDE_SEQUENCE_TAB = 'Aligned nucleotide sequence';
const NUCLEOTIDE_SEQUENCE_TAB = 'Nucleotide sequence';

// Helper Functions for Dynamic Labels
const getAlignedSegmentLabel = (segment: string) => `${segment} (aligned)`;
const getUnalignedSegmentLabel = (segment: string) => `${segment} (unaligned)`;

// Test Selectors
const BUTTON_ROLE = 'button';

function renderSequenceViewer(referenceGenomes: ReferenceGenomes, segmentReferences: SegmentReferenceSelections) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequencesContainer
                organism={testOrganism}
                accessionVersion={accessionVersion}
                clientConfig={testConfig.public}
                referenceGenomes={referenceGenomes}
                loadSequencesAutomatically={false}
                segmentReferences={segmentReferences}
            />
        </QueryClientProvider>,
    );
}

function renderSingleReferenceSequenceViewer(
    referenceGenomes: ReferenceGenomes,
    segmentReferences: SegmentReferenceSelections,
) {
    renderSequenceViewer(referenceGenomes, segmentReferences);
}

const singleSegmentSequence = 'SingleSegmentSequence';
const multiSegmentSequence = 'MultiSegmentSequence';
const unalignedSingleSegmentSequence = 'UnalignedSingleSegmentSequence';
const unalignedMultiSegmentSequence = 'UnalignedMultiSegmentSequence';

describe('SequencesContainer', () => {
    describe('with single reference', () => {
        beforeEach(() => {
            mockRequest.lapis.alignedNucleotideSequences(200, `>some\n${singleSegmentSequence}`);
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(200, `>some\n${multiSegmentSequence}`, 'L');
            mockRequest.lapis.unalignedNucleotideSequences(200, `>some\n${unalignedSingleSegmentSequence}`);
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(200, '', 'main');
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${unalignedMultiSegmentSequence}`,
                'L',
            );
        });

        test('should render single segmented sequence', async () => {
            renderSingleReferenceSequenceViewer(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, { main: null });

            click(LOAD_SEQUENCES_BUTTON);

            click(ALIGNED_NUCLEOTIDE_SEQUENCE_TAB);
            await waitFor(() => {
                expect(
                    screen.getByText(singleSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });
            expectTabActive(ALIGNED_NUCLEOTIDE_SEQUENCE_TAB);
            expectTabNotActive(NUCLEOTIDE_SEQUENCE_TAB);

            click(NUCLEOTIDE_SEQUENCE_TAB);
            await waitFor(() => {
                expect(
                    screen.getByText(unalignedSingleSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });
            expectTabActive(NUCLEOTIDE_SEQUENCE_TAB);
            expectTabNotActive(ALIGNED_NUCLEOTIDE_SEQUENCE_TAB);
        });

        test('should render multi segmented sequence', async () => {
            renderSingleReferenceSequenceViewer(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, { L: null, S: null });
            click(LOAD_SEQUENCES_BUTTON);

            click(getAlignedSegmentLabel('L'));
            await waitFor(() => {
                expect(
                    screen.getByText(multiSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });
            // Regression test for #5330
            expectTabActive(getAlignedSegmentLabel('L'));
            expectTabNotActive(getAlignedSegmentLabel('L'));

            click(getUnalignedSegmentLabel('L'));
            await waitFor(() => {
                expect(
                    screen.getByText(unalignedMultiSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });
            expectTabActive(getUnalignedSegmentLabel('L'));
            expectTabNotActive(getAlignedSegmentLabel('L'));
        });
    });

    describe('with multiple references', () => {
        const suborganism1 = 'sub1';
        const suborganism2 = 'sub2';

        test('should render single segmented sequences', async () => {
            const alignedSequence = `${suborganism1}AlignedSequence`;
            const sequence = `${suborganism1}Sequence`;
            // Single segment uses non-segmented endpoints even in multi-reference mode
            mockRequest.lapis.alignedNucleotideSequences(200, `>some\n${alignedSequence}`);
            mockRequest.lapis.unalignedNucleotideSequences(200, `>some\n${sequence}`);

            renderSequenceViewer(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, { main: suborganism1 });

            click(LOAD_SEQUENCES_BUTTON);

            click(ALIGNED_NUCLEOTIDE_SEQUENCE_TAB);
            await waitFor(() => {
                expect(screen.getByText(alignedSequence, { exact: false })).toBeVisible();
            });
            expectTabActive(ALIGNED_NUCLEOTIDE_SEQUENCE_TAB);
            expectTabNotActive(NUCLEOTIDE_SEQUENCE_TAB);

            click(NUCLEOTIDE_SEQUENCE_TAB);
            await waitFor(() => {
                expect(screen.getByText(sequence, { exact: false })).toBeVisible();
            });
            expectTabActive(NUCLEOTIDE_SEQUENCE_TAB);
            expectTabNotActive(ALIGNED_NUCLEOTIDE_SEQUENCE_TAB);
        });

        test('should render multi segmented sequences', async () => {
            const alignedSequence = `${suborganism2}AlignedSequence`;
            const sequence = `${suborganism2}Sequence`;
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${alignedSequence}`,
                `${suborganism2}-segment1`,
            );
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(200, ``, `${suborganism2}-segment1`);
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${sequence}`,
                `${suborganism2}-segment2`,
            );

            renderSequenceViewer(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, {
                L: suborganism2,
                S: suborganism1,
            });

            click(LOAD_SEQUENCES_BUTTON);

            click(getAlignedSegmentLabel('L'));
            await waitFor(() => {
                expect(screen.getByText(alignedSequence, { exact: false })).toBeVisible();
            });
            expectTabActive(getAlignedSegmentLabel('L'));
            expectTabNotActive(getUnalignedSegmentLabel('L'));

            click(getUnalignedSegmentLabel('S'));
            await waitFor(() => {
                expect(screen.getByText(sequence, { exact: false })).toBeVisible();
            });
            expectTabActive(getUnalignedSegmentLabel('S'));
            expectTabNotActive(getAlignedSegmentLabel('L'));
        });
    });

    function click(name: string) {
        act(() => screen.getByRole(BUTTON_ROLE, { name }).click());
    }

    function expectTabActive(name: string) {
        expect(screen.getByRole(BUTTON_ROLE, { name })).toHaveClass(TAB_ACTIVE_CLASS);
    }

    function expectTabNotActive(name: string) {
        expect(screen.getByRole(BUTTON_ROLE, { name })).not.toHaveClass(TAB_ACTIVE_CLASS);
    }
});
