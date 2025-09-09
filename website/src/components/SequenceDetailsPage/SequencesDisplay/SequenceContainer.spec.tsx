import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SequencesContainer } from './SequencesContainer.tsx';
import { mockRequest, testConfig, testOrganism } from '../../../../vitest.setup.ts';
import { type NucleotideSegmentNames, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';

vi.mock('../../config', () => ({
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy'),
}));

const queryClient = new QueryClient();
const accessionVersion = 'accession';

function renderSequenceViewer({
    nucleotideSegmentNames,
    genes,
}: {
    nucleotideSegmentNames: NucleotideSegmentNames;
    genes: string[];
}) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequencesContainer
                organism={testOrganism}
                accessionVersion={accessionVersion}
                clientConfig={testConfig.public}
                referenceGenomeSequenceNames={{
                    [SINGLE_REFERENCE]: {
                        genes,
                        nucleotideSequences: nucleotideSegmentNames,
                        insdcAccessionFull: [],
                    },
                }}
                loadSequencesAutomatically={false}
                suborganism={SINGLE_REFERENCE}
            />
        </QueryClientProvider>,
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
            renderSequenceViewer({
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
            renderSequenceViewer({
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

    function click(name: string) {
        act(() => screen.getByRole('button', { name }).click());
    }
});
