import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SequencesContainer } from './SequencesContainer.tsx';
import { mockRequest, testConfig, testOrganism } from '../../../../vitest.setup.ts';
import {
    type NucleotideSegmentNames,
    type ReferenceGenomesLightweightSchema,
    SINGLE_REFERENCE,
} from '../../../types/referencesGenomes.ts';

vi.mock('../../config', () => ({
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy'),
}));

const queryClient = new QueryClient();
const accessionVersion = 'accession';

function renderSequenceViewer(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    suborganism: string,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequencesContainer
                organism={testOrganism}
                accessionVersion={accessionVersion}
                clientConfig={testConfig.public}
                referenceGenomeLightweightSchema={referenceGenomeLightweightSchema}
                loadSequencesAutomatically={false}
                suborganism={suborganism}
            />
        </QueryClientProvider>,
    );
}

function renderSingleReferenceSequenceViewer({
    nucleotideSegmentNames,
    genes,
}: {
    nucleotideSegmentNames: NucleotideSegmentNames;
    genes: string[];
}) {
    renderSequenceViewer(
        {
            [SINGLE_REFERENCE]: {
                geneNames: genes,
                nucleotideSegmentNames,
                insdcAccessionFull: [],
            },
        },
        SINGLE_REFERENCE,
    );
}

const multiSegmentName = 'main2';

const singleSegmentSequence = 'SingleSegmentSequence';
const multiSegmentSequence = 'MultiSegmentSequence';
const unalignedSingleSegmentSequence = 'UnalignedSingleSegmentSequence';
const unalignedMultiSegmentSequence = 'UnalignedMultiSegmentSequence';

describe('SequencesContainer', () => {
    describe('with single reference', () => {
        beforeEach(() => {
            mockRequest.lapis.alignedNucleotideSequences(200, `>some\n${singleSegmentSequence}`);
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${multiSegmentSequence}`,
                multiSegmentName,
            );
            mockRequest.lapis.unalignedNucleotideSequences(200, `>some\n${unalignedSingleSegmentSequence}`);
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(200, '', 'main');
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(
                200,
                `>some\n${unalignedMultiSegmentSequence}`,
                multiSegmentName,
            );
        });

        test('should render single segmented sequence', async () => {
            renderSingleReferenceSequenceViewer({
                nucleotideSegmentNames: ['main'],
                genes: [],
            });

            click('Load sequences');

            click('Aligned nucleotide sequence');
            await waitFor(() => {
                expect(
                    screen.getByText(singleSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });

            click('Nucleotide sequence');
            await waitFor(() => {
                expect(
                    screen.getByText(unalignedSingleSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });
        });

        test('should render multi segmented sequence', async () => {
            renderSingleReferenceSequenceViewer({
                nucleotideSegmentNames: ['main', multiSegmentName],
                genes: [],
            });

            click('Load sequences');

            click(`${multiSegmentName} (aligned)`);
            await waitFor(() => {
                expect(
                    screen.getByText(multiSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });

            click(`${multiSegmentName} (unaligned)`);
            await waitFor(() => {
                expect(
                    screen.getByText(unalignedMultiSegmentSequence, {
                        exact: false,
                    }),
                ).toBeVisible();
            });
        });
    });

    describe('with multiple references', () => {
        const suborganism1 = 'sub1';
        const suborganism2 = 'sub2';

        test('should render single segmented sequences', async () => {
            const alignedSequence = `${suborganism1}AlignedSequence`;
            const sequence = `${suborganism1}Sequence`;
            mockRequest.lapis.alignedNucleotideSequencesMultiSegment(200, `>some\n${alignedSequence}`, suborganism1);
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(200, `>some\n${sequence}`, suborganism1);

            renderSequenceViewer(
                {
                    [suborganism1]: {
                        nucleotideSegmentNames: ['main'],
                        geneNames: [],
                        insdcAccessionFull: [],
                    },
                    [suborganism2]: {
                        nucleotideSegmentNames: ['main'],
                        geneNames: [],
                        insdcAccessionFull: [],
                    },
                },
                suborganism1,
            );

            click('Load sequences');

            click('Aligned nucleotide sequence');
            await waitFor(() => {
                expect(screen.getByText(alignedSequence, { exact: false })).toBeVisible();
            });

            click('Nucleotide sequence');
            await waitFor(() => {
                expect(screen.getByText(sequence, { exact: false })).toBeVisible();
            });
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

            renderSequenceViewer(
                {
                    [suborganism1]: {
                        nucleotideSegmentNames: ['main'],
                        geneNames: [],
                        insdcAccessionFull: [],
                    },
                    [suborganism2]: {
                        nucleotideSegmentNames: ['segment1', 'segment2'],
                        geneNames: [],
                        insdcAccessionFull: [],
                    },
                },
                suborganism2,
            );

            click('Load sequences');

            click('segment1 (aligned)');
            await waitFor(() => {
                expect(screen.getByText(alignedSequence, { exact: false })).toBeVisible();
            });

            click('segment2 (unaligned)');
            await waitFor(() => {
                expect(screen.getByText(sequence, { exact: false })).toBeVisible();
            });
        });
    });

    function click(name: string) {
        act(() => screen.getByRole('button', { name }).click());
    }
});
