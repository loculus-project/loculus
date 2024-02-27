import { render, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { ReviewPage } from './ReviewPage.tsx';
import { openDataUseTerms } from '../../../tests/e2e.fixture.ts';
import { mockRequest, testAccessToken, testConfig, testOrganism } from '../../../vitest.setup.ts';
import {
    approvedForReleaseStatus,
    awaitingApprovalForRevocationStatus,
    awaitingApprovalStatus,
    hasErrorsStatus,
    inProcessingStatus,
    receivedStatus,
    type SequenceEntryStatus,
} from '../../types/backend.ts';

function renderReviewPage() {
    return render(
        <ReviewPage organism={testOrganism} accessToken={testAccessToken} clientConfig={testConfig.public} />,
    );
}

const receivedTestData: SequenceEntryStatus = {
    submissionId: 'custom1',
    status: receivedStatus,
    accession: 'accession1',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
};

const processingTestData: SequenceEntryStatus = {
    submissionId: 'custom4',
    status: inProcessingStatus,
    accession: 'accession4',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
};

const erroneousTestData: SequenceEntryStatus = {
    submissionId: 'custom2',
    status: hasErrorsStatus,
    accession: 'accession2',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
};

const awaitingApprovalTestData: SequenceEntryStatus = {
    submissionId: 'custom3',
    status: awaitingApprovalStatus,
    accession: 'accession3',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
};

const emptyStatusCounts = {
    [receivedStatus]: 0,
    [inProcessingStatus]: 0,
    [hasErrorsStatus]: 0,
    [awaitingApprovalStatus]: 0,
    [approvedForReleaseStatus]: 0,
    [awaitingApprovalForRevocationStatus]: 0,
};

const generateGetSequencesResponse = (sequenceEntries: SequenceEntryStatus[]) => {
    const statusCounts = sequenceEntries.reduce(
        (acc, sequence) => {
            acc[sequence.status] = (acc[sequence.status] || 0) + 1;
            return acc;
        },
        { ...emptyStatusCounts },
    );
    return { sequenceEntries, statusCounts };
};

describe('ReviewPage', () => {
    test('should render the review page and indicate there is no data', async () => {
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]));

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText('No sequences to review')).toBeDefined();
        });
    });

    test('should render the review page and show data', async () => {
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([receivedTestData]));

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(receivedTestData.submissionId)).toBeDefined();
            expect(getByText(receivedTestData.accession)).toBeDefined();
        });
    });

    test('should render the review page and show button to bulk delete/approve all erroneous sequences', async () => {
        mockRequest.backend.getSequences(
            200,
            generateGetSequencesResponse([erroneousTestData, awaitingApprovalTestData]),
        );
        mockRequest.backend.getDataToEdit();
        mockRequest.backend.approveSequences();
        mockRequest.backend.deleteSequences();

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(erroneousTestData.accession)).toBeDefined();
            expect(getByText(awaitingApprovalTestData.accession)).toBeDefined();
        });

    

        getByText('Discard sequences').click();

        await waitFor(() => {
            expect(getByText((text) => text.includes('Discard 1 sequences with errors'))).toBeDefined();
            expect(getByText((text) => text.includes('Release 1 sequences without errors'))).toBeDefined();
        });

        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]));

        getByText((text) => text.includes('Discard 1 sequences with errors')).click();
        getByText((text) => text.includes('Confirm')).click();
        getByText((text) => text.includes('Release 1 sequences without errors')).click();
        getByText((text) => text.includes('Confirm')).click();

        await waitFor(() => {
            expect(getByText('No sequences to review')).toBeDefined();
        });
    });

    test('should render the review page and show how many sequences are processed', async () => {
        mockRequest.backend.getSequences(
            200,
            generateGetSequencesResponse([
                receivedTestData,
                processingTestData,
                erroneousTestData,
                awaitingApprovalTestData,
            ]),
        );
        mockRequest.backend.getDataToEdit();

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText((text) => text.includes('2 of 4 sequences processed.'))).toBeDefined();
        });
    });
});
