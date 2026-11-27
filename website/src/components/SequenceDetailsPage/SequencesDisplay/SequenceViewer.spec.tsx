import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { SequencesViewer } from './SequenceViewer.tsx';
import { mockRequest, testConfig, TestIsland, testOrganism } from '../../../../vitest.setup.ts';
import { type ClientConfig } from '../../../types/runtimeConfig.ts';
import { type SequenceType } from '../../../utils/sequenceTypeHelpers.ts';

vi.mock('../../config', () => ({
    getLapisUrl: vi.fn().mockReturnValue('http://lapis.dummy'),
}));

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
    useLapisMultiSegmentedEndpoint: boolean,
    clientConfig: ClientConfig = testConfig.public,
) {
    render(
        <TestIsland clientConfig={clientConfig}>
            <SequencesViewer
                organism={testOrganism}
                accessionVersion={accessionVersion}
                sequenceType={sequenceType}
                useLapisMultiSegmentedEndpoint={useLapisMultiSegmentedEndpoint}
            />
        </TestIsland>,
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
