import { render, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { ReviewPage } from './ReviewPage.tsx';
import { openDataUseTerms } from '../../../tests/e2e.fixture.ts';
import { mockRequest, testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import {
    approvedForReleaseStatus,
    processedStatus,
    inProcessingStatus,
    receivedStatus,
    type SequenceEntryStatus,
    type GetSequencesResponse,
    noIssuesProcessingResult,
    warningsProcessingResult,
    errorsProcessingResult,
} from '../../types/backend.ts';

const unreleasedSequencesRegex = /You do not currently have any unreleased sequences awaiting review.*/;

const testGroup = testGroups[0];

function renderReviewPage() {
    return render(
        <ReviewPage
            group={testGroup}
            organism={testOrganism}
            accessToken={testAccessToken}
            clientConfig={testConfig.public}
        />,
    );
}

const receivedTestData: SequenceEntryStatus = {
    submissionId: 'custom1',
    status: receivedStatus,
    hasErrors: false,
    hasWarnings: false,
    accession: 'accession1',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
    groupId: 42,
    submitter: 'submitter',
};

const processingTestData: SequenceEntryStatus = {
    submissionId: 'custom4',
    status: inProcessingStatus,
    hasErrors: false,
    hasWarnings: false,
    accession: 'accession4',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
    groupId: 42,
    submitter: 'submitter',
};

const erroneousTestData: SequenceEntryStatus = {
    submissionId: 'custom2',
    status: processedStatus,
    hasErrors: true,
    hasWarnings: false,
    accession: 'accession2',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
    groupId: 42,
    submitter: 'submitter',
};

const awaitingApprovalTestData: SequenceEntryStatus = {
    submissionId: 'custom3',
    status: processedStatus,
    hasErrors: false,
    hasWarnings: false,
    accession: 'accession3',
    version: 1,
    isRevocation: false,
    dataUseTerms: openDataUseTerms,
    groupId: 42,
    submitter: 'submitter',
};

const emptyStatusCounts = {
    [receivedStatus]: 0,
    [inProcessingStatus]: 0,
    [processedStatus]: 0,
    [approvedForReleaseStatus]: 0,
};

const emptyProcessingResultCounts = {
    [noIssuesProcessingResult]: 0,
    [warningsProcessingResult]: 0,
    [errorsProcessingResult]: 0,
};

const generateGetSequencesResponse = (sequenceEntries: SequenceEntryStatus[]): GetSequencesResponse => {
    const statusCounts = sequenceEntries.reduce(
        (acc, sequence) => {
            acc[sequence.status] = (acc[sequence.status] || 0) + 1;
            return acc;
        },
        { ...emptyStatusCounts },
    );
    const processingResultCounts = sequenceEntries.reduce(
        (acc, sequence) => {
            if (sequence.hasErrors) {
                acc[errorsProcessingResult] = acc[errorsProcessingResult] + 1;
            } else if (sequence.hasWarnings) {
                acc[warningsProcessingResult] = acc[warningsProcessingResult] + 1;
            } else {
                acc[noIssuesProcessingResult] = acc[noIssuesProcessingResult] + 1;
            }
            return acc;
        },
        { ...emptyProcessingResultCounts },
    );
    return { sequenceEntries, statusCounts, processingResultCounts };
};

describe('ReviewPage', () => {
    test('should render the review page and indicate there is no data', async () => {
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]));

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(unreleasedSequencesRegex)).toBeDefined();
        });
    });

    test('should render the review page and show data', async () => {
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([receivedTestData]));

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(receivedTestData.submissionId)).toBeDefined();
            expect(getByText(`${receivedTestData.accession}.${receivedTestData.version}`)).toBeDefined();
        });
    });

    test('should request data from the right group', async () => {
        let requestedGroupFilter: string | null = null;
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]), (request) => {
            const params = new URL(request.url).searchParams;
            requestedGroupFilter = params.get('groupIdsFilter');
        });

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText(unreleasedSequencesRegex)).toBeDefined();
        });

        expect(requestedGroupFilter).toBe(testGroup.groupId.toString());
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
            expect(getByText(`${erroneousTestData.accession}.${erroneousTestData.version}`)).toBeDefined();
            expect(
                getByText(`${awaitingApprovalTestData.accession}.${awaitingApprovalTestData.version}`),
            ).toBeDefined();
        });

        getByText('Discard sequences').click();

        await waitFor(() => {
            expect(getByText((text) => text.includes('Discard 1 sequence with errors'))).toBeDefined();
            expect(getByText((text) => text.includes('Release 1 valid sequence'))).toBeDefined();
        });

        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]));

        getByText((text) => text.includes('Release 1 valid sequence')).click();
        await waitFor(() => {
            expect(getByText('Release')).toBeDefined();
        });
        getByText('Release').click();

        await waitFor(() => {
            expect(getByText(unreleasedSequencesRegex)).toBeDefined();
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
            expect(getByText((text) => text.includes('2 of 4 sequences processed'))).toBeDefined();
        });
    });
});
