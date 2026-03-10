import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { SequencesContainer } from './SequencesContainer.tsx';
import { mockRequest, testConfig, testOrganism } from '../../../../vitest.setup.ts';
import {
    MULTI_SEG_MULTI_REF_REFERENCEGENOMES,
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_MULTI_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../../types/referenceGenomes.spec.ts';
import type { ReferenceGenomesInfo } from '../../../types/referencesGenomes.ts';
import type { SegmentReferenceSelections } from '../../../utils/sequenceTypeHelpers.ts';

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

// Test Selectors
const BUTTON_ROLE = 'button';

function renderSequenceViewer(
    referenceGenomesInfo: ReferenceGenomesInfo,
    segmentReferences: SegmentReferenceSelections,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequencesContainer
                organism={testOrganism}
                accessionVersion={accessionVersion}
                clientConfig={testConfig.public}
                referenceGenomesInfo={referenceGenomesInfo}
                loadSequencesAutomatically={false}
                segmentReferences={segmentReferences}
            />
        </QueryClientProvider>,
    );
}

const singleSegmentSequence = 'SingleSegmentSequence';
const multiSegmentSequence = 'MultiSegmentSequence';
const unalignedSingleSegmentSequence = 'UnalignedSingleSegmentSequence';
const unalignedMultiSegmentSequence = 'UnalignedMultiSegmentSequence';

describe('SequencesContainer', () => {
    describe('with single reference', () => {
        test('should render single segmented sequence', async () => {
            mockRequest.lapis.alignedNucleotideSequences(200, `>some\n${singleSegmentSequence}`);
            mockRequest.lapis.unalignedNucleotideSequences(200, `>some\n${unalignedSingleSegmentSequence}`);
            renderSequenceViewer(SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES, { main: null });

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
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(200, `>some\n${multiSegmentSequence}`, 'L');
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${unalignedMultiSegmentSequence}`,
                'L',
            );
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${unalignedMultiSegmentSequence}`,
                'S',
            );
            // eslint-disable-next-line @typescript-eslint/naming-convention
            renderSequenceViewer(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES, { L: 'singleReference', S: 'singleReference' });
            click(LOAD_SEQUENCES_BUTTON);

            await waitFor(() => {
                expect(screen.getByRole(BUTTON_ROLE, { name: 'Nucleotide sequences' })).toBeVisible();
            });
            expect(screen.getByRole(BUTTON_ROLE, { name: 'Aligned nucleotide sequences' })).toBeVisible();
            expect(screen.getByRole(BUTTON_ROLE, { name: 'Aligned amino acid sequences' })).toBeVisible();

            click('Nucleotide sequences');

            await waitFor(() => {
                const options = screen.getAllByRole('option');
                const optionLabels = options.map((o) => o.textContent);
                expect(optionLabels).toContain('L');
                expect(optionLabels).toContain('S');
                expectTabNotActive('Aligned nucleotide sequences');
            });
        });
    });

    describe('with multiple references', () => {
        const reference1 = 'ref1';

        test('should render single segmented sequences with multiple references', async () => {
            const alignedSequence = `${reference1}AlignedSequence`;
            const sequence = `${reference1}Sequence`;
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(200, `>some\n${alignedSequence}`, reference1);
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(200, `>some\n${sequence}`, reference1);

            renderSequenceViewer(SINGLE_SEG_MULTI_REF_REFERENCEGENOMES, { main: reference1 });

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

        test('should render multi segmented sequences with multiple references', async () => {
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(200, `>some\n${multiSegmentSequence}`, 'L-ref1');
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${unalignedMultiSegmentSequence}`,
                'L-ref1',
            );
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${unalignedMultiSegmentSequence}`,
                'S',
            );
            // eslint-disable-next-line @typescript-eslint/naming-convention
            renderSequenceViewer(MULTI_SEG_MULTI_REF_REFERENCEGENOMES, { L: 'ref1', S: 'singleReference' });
            click(LOAD_SEQUENCES_BUTTON);

            await waitFor(() => {
                expect(screen.getByRole(BUTTON_ROLE, { name: 'Nucleotide sequences' })).toBeVisible();
            });
            expect(screen.getByRole(BUTTON_ROLE, { name: 'Aligned nucleotide sequences' })).toBeVisible();
            expect(screen.getByRole(BUTTON_ROLE, { name: 'Aligned amino acid sequences' })).toBeVisible();

            click('Aligned nucleotide sequences');

            await waitFor(() => {
                const options = screen.getAllByRole('option');
                const optionLabels = options.map((o) => o.textContent);
                    expect(optionLabels).toContain('L (segment)');
                expect(optionLabels).toContain('S (segment)');
            });
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
