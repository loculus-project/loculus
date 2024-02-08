import { render, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { ReviewPage } from './ReviewPage.tsx';
import { openDataUseTerms } from '../../../tests/e2e.fixture.ts';
import { mockRequest, testAccessToken, testConfig, testOrganism } from '../../../vitest.setup.ts';
import {
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

describe('ReviewPage', () => {
    test('should render the review page and indicate there is no data', async () => {
        mockRequest.backend.getSequences(200);

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText('No sequences to review')).toBeDefined();
        });
    });

    test('should render the review page and show data', async () => {
        mockRequest.backend.getSequences(200, [receivedTestData]);

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(receivedTestData.submissionId)).toBeDefined();
            expect(getByText(receivedTestData.accession)).toBeDefined();
        });
    });

    test('should render the review page and show button to bulk delete/approve all erroneous sequences', async () => {
        mockRequest.backend.getSequences(200, [erroneousTestData, awaitingApprovalTestData]);
        mockRequest.backend.approveSequences();
        mockRequest.backend.deleteSequences();

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(erroneousTestData.accession)).toBeDefined();
            expect(getByText(awaitingApprovalTestData.accession)).toBeDefined();
        });

        await waitFor(() => {
            expect(getByText((text) => text.includes('Discard 1 sequences with errors'))).toBeDefined();
            expect(getByText((text) => text.includes('Release 1 sequences without errors'))).toBeDefined();
        });

        mockRequest.backend.getSequences(200, []);

        getByText((text) => text.includes('Discard 1 sequences with errors')).click();
        getByText((text) => text.includes('Release 1 sequences without errors')).click();

        await waitFor(() => {
            expect(getByText('No sequences to review')).toBeDefined();
        });
    });

    test('should render the review page and show how many sequences are processed', async () => {
        mockRequest.backend.getSequences(200, [
            receivedTestData,
            processingTestData,
            erroneousTestData,
            awaitingApprovalTestData,
        ]);

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText((text) => text.includes('2 of 4 sequences processed.'))).toBeDefined();
        });
    });
});
