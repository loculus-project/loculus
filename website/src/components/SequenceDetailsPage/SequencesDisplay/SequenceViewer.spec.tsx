import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SequencesViewer } from './SequenceViewer.tsx';
import { mockRequest, testConfig, testOrganism } from '../../../../vitest.setup.ts';
import { type ClientConfig } from '../../../types/runtimeConfig.ts';
import { type SequenceType } from '../../../utils/sequenceTypeHelpers.ts';

vi.mock('../../config', () => ({
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy'),
}));

const queryClient = new QueryClient();
const accessionVersion = 'accession';

const singleSegmentedSequenceType: SequenceType = {
    type: 'nucleotide',
    name: { name: 'pretty much anything', lapisName: 'pretty much anything' },
    aligned: true,
};

const multiSegmentName = 'main2';
const multiSegmentedSequenceType: SequenceType = {
    type: 'nucleotide',
    name: { name: multiSegmentName, lapisName: multiSegmentName },
    aligned: true,
};

function renderSequenceViewer(
    sequenceType: SequenceType,
    isMultiSegmented: boolean,
    clientConfig: ClientConfig = testConfig.public,
) {
    render(
        <QueryClientProvider client={queryClient}>
            <SequencesViewer
                organism={testOrganism}
                accessionVersion={accessionVersion}
                clientConfig={clientConfig}
                sequenceType={sequenceType}
                isMultiSegmented={isMultiSegmented}
            />
        </QueryClientProvider>,
    );
}

const singleSegmentSequence = 'SingleSegmentSequence';
const multiSegmentSequence = 'MultiSegmentSequence';

describe('SequenceViewer', () => {
    beforeEach(() => {
        mockRequest.lapis.alignedNucleotideSequences(200, `>some\n${singleSegmentSequence}`);
        mockRequest.lapis.alignedNucleotideSequencesMultiSegment(
            200,
            `>some\n${multiSegmentSequence}`,
            multiSegmentName,
        );
    });

    test('should render single segmented sequence', async () => {
        renderSequenceViewer(singleSegmentedSequenceType, false);

        await waitFor(() => {
            expect(
                screen.getByText(singleSegmentSequence, {
                    exact: false,
                }),
            ).toBeVisible();
        });
    });

    test('should render multi segmented sequence', async () => {
        renderSequenceViewer(multiSegmentedSequenceType, true);

        await waitFor(() => {
            expect(
                screen.getByText(multiSegmentSequence, {
                    exact: false,
                }),
            ).toBeVisible();
        });
    });
});
