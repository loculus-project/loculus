import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { ReviewPage } from './ReviewPage.tsx';
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
    openDataUseTermsOption,
} from '../../types/backend.ts';
import { SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES } from '../../types/referenceGenomes.spec.ts';

const openDataUseTerms = { type: openDataUseTermsOption } as const;

const unreleasedSequencesRegex = /You do not currently have any unreleased sequences awaiting review.*/;

const testGroup = testGroups[0];

function renderReviewPage() {
    return render(
        <ReviewPage
            group={testGroup}
            organism={testOrganism}
            metadataDisplayNames={new Map()}
            accessToken={testAccessToken}
            clientConfig={testConfig.public}
            filesEnabled={false}
            referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
        />,
    );
}

const receivedTestData: SequenceEntryStatus = {
    submissionId: 'custom1',
    status: receivedStatus,
    processingResult: null,
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
    processingResult: null,
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
    processingResult: errorsProcessingResult,
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
    processingResult: noIssuesProcessingResult,
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
            if (sequence.processingResult === errorsProcessingResult) {
                acc[errorsProcessingResult] = acc[errorsProcessingResult] + 1;
            } else if (sequence.processingResult === warningsProcessingResult) {
                acc[warningsProcessingResult] = acc[warningsProcessingResult] + 1;
            } else if (sequence.processingResult === noIssuesProcessingResult) {
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

        await userEvent.click(getByText('Discard sequences'));

        await waitFor(() => {
            expect(getByText((text) => text.includes('Discard 1 sequence with errors'))).toBeDefined();
            expect(getByText((text) => text.includes('Release 1 valid sequence'))).toBeDefined();
        });

        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]));

        await userEvent.click(getByText((text) => text.includes('Release 1 valid sequence')));

        await waitFor(() => {
            expect(getByText('Release')).toBeDefined();
        });

        await userEvent.click(getByText('Release'));

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
