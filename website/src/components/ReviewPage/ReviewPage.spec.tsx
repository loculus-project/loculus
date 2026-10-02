import { act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test, vi } from 'vitest';

import { ReviewPage } from './ReviewPage.tsx';
import {
    defaultReviewData,
    testServer,
    mockRequest,
    testAccessToken,
    testConfig,
    testGroups,
    testOrganism,
} from '../../../vitest.setup.ts';
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
            metadataSchema={[]}
            accessToken={testAccessToken}
            clientConfig={testConfig.public}
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
    return {
        sequenceEntries: sequenceEntries.map((entry) => ({
            ...entry,
            reviewData:
                entry.status === processedStatus && !entry.isRevocation
                    ? {
                          metadata: defaultReviewData.processedData.metadata,
                          errors: defaultReviewData.errors,
                          warnings: defaultReviewData.warnings,
                          files: defaultReviewData.processedData.files,
                          revision: null,
                      }
                    : undefined,
        })),
        statusCounts,
        processingResultCounts,
    };
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

    test('polls processing pages quickly and slows down once processed', async () => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const requests = vi.fn();
        let entries = [receivedTestData];
        testServer.use(
            http.get(`${testConfig.public.backendUrl}/${testOrganism}/get-sequences`, () => {
                requests();
                return HttpResponse.json(generateGetSequencesResponse(entries));
            }),
        );
        const page = renderReviewPage();
        try {
            await page.findByText(receivedTestData.submissionId);
            expect(requests).toHaveBeenCalledTimes(1);
            await act(() => vi.advanceTimersByTimeAsync(1999));
            expect(requests).toHaveBeenCalledTimes(1);
            entries = [awaitingApprovalTestData];
            await act(() => vi.advanceTimersByTimeAsync(1));
            await page.findByTestId(`view-sequences-${awaitingApprovalTestData.accession}`);
            expect(requests).toHaveBeenCalledTimes(2);
            await act(() => vi.advanceTimersByTimeAsync(29999));
            expect(requests).toHaveBeenCalledTimes(2);
            await act(() => vi.advanceTimersByTimeAsync(1));
            await waitFor(() => expect(requests).toHaveBeenCalledTimes(3));
        } finally {
            page.unmount();
            vi.useRealTimers();
        }
    });

    test('should request data from the right group', async () => {
        let requestedGroupFilter: string | null = null;
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]), (request) => {
            const params = new URL(request.url).searchParams;
            requestedGroupFilter = params.get('groupIdsFilter');
            expect(params.get('includeReviewData')).toBe('true');
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
            expect(getByText((text) => text.includes('Approve 1 valid sequence'))).toBeDefined();
        });

        mockRequest.backend.getSequences(200, generateGetSequencesResponse([]));

        await userEvent.click(getByText((text) => text.includes('Approve 1 valid sequence')));

        await waitFor(() => {
            expect(getByText('Approve')).toBeDefined();
        });

        await userEvent.click(getByText('Approve'));

        await waitFor(() => {
            expect(getByText(unreleasedSequencesRegex)).toBeDefined();
        });
    });

    test('loads card data from the list and sequences only when DNA is opened, with retry on error', async () => {
        mockRequest.backend.getSequences(200, generateGetSequencesResponse([awaitingApprovalTestData]));
        const requestedVersions = vi.fn();
        let fail = true;
        testServer.use(
            http.get(
                `${testConfig.public.backendUrl}/${testOrganism}/get-data-to-edit/:accession/:version`,
                ({ params }) => {
                    requestedVersions(params.accession, params.version);
                    return fail
                        ? new HttpResponse(null, { status: 500 })
                        : HttpResponse.json({
                              ...defaultReviewData,
                              accession: params.accession,
                              version: Number(params.version),
                          });
                },
            ),
        );
        const user = userEvent.setup();
        const page = renderReviewPage();
        expect(await page.findByText('errorMessage', { exact: false })).toBeVisible();
        expect(requestedVersions).not.toHaveBeenCalled();
        await user.click(page.getByTestId(`view-sequences-${awaitingApprovalTestData.accession}`));
        const dialog = within(page.getByRole('dialog', { name: 'Processed sequences' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent('Sequences could not be loaded');
        expect(requestedVersions).toHaveBeenCalledExactlyOnceWith(awaitingApprovalTestData.accession, '1');
        fail = false;
        await user.click(dialog.getByRole('button', { name: 'Retry' }));
        expect(
            await page.findByText(Object.values(defaultReviewData.processedData.unalignedNucleotideSequences)[0]!),
        ).toBeVisible();
        expect(requestedVersions).toHaveBeenCalledTimes(2);
    });

    test('returns to page one when a filter leaves no matching entries', async () => {
        const requestedPages: number[] = [];
        testServer.use(
            http.get(`${testConfig.public.backendUrl}/${testOrganism}/get-sequences`, ({ request }) => {
                const params = new URL(request.url).searchParams;
                requestedPages.push(Number(params.get('page')));
                const response = generateGetSequencesResponse([awaitingApprovalTestData]);
                response.statusCounts[processedStatus] = 51;
                response.processingResultCounts[noIssuesProcessingResult] = 51;
                if (!params.get('processingResultFilter')?.includes(noIssuesProcessingResult)) {
                    response.sequenceEntries = [];
                }
                return HttpResponse.json(response);
            }),
        );
        const user = userEvent.setup();
        const page = renderReviewPage();
        await user.click(await page.findByRole('button', { name: 'Go to page 2' }));
        await waitFor(() => expect(requestedPages.at(-1)).toBe(1));
        await user.click(page.getByRole('checkbox', { name: /no issues/ }));
        await waitFor(() => expect(requestedPages.at(-1)).toBe(0));
        expect(requestedPages).not.toContain(-1);
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

        const { getByText } = renderReviewPage();

        await waitFor(() => {
            expect(getByText((text) => text.includes('2 of 4 sequences processed'))).toBeDefined();
        });
    });
});
