import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, test, vi } from 'vitest';

import { ReviewCard } from './ReviewCard';
import { RevisionDiffPage } from './RevisionDiffPage';
import { defaultReviewData, testAccessToken, testConfig, testOrganism, testServer } from '../../../vitest.setup';
import { inProcessingStatus, processedStatus, receivedStatus, type SequenceEntryStatus } from '../../types/backend';
import type { Metadata } from '../../types/config';
import {
    MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
} from '../../types/referenceGenomes.spec';

const metadata: Metadata[] = [
    { name: 'authors', type: 'authors', displayName: 'Authors', header: 'Authors' },
    { name: 'country', type: 'string', displayName: 'Country', header: 'Nucleotide mutations' },
];
const revision: SequenceEntryStatus = {
    accession: 'LOC_TEST',
    version: 2,
    status: processedStatus,
    processingResult: 'NO_ISSUES',
    submissionId: 'sample',
    isRevocation: false,
    dataUseTerms: { type: 'OPEN' },
    groupId: 1,
    submitter: 'test',
};

function mockVersions(failPrevious = false) {
    const state = {
        authors: 'Old author; New author',
        sequences: { 1: { main: 'ACGT' }, 2: { main: 'ACGT' } } as Record<string, Record<string, string | null>>,
        failPrevious,
        failCurrent: false,
        failStatusLookup: false,
        groupId: 1,
        status: processedStatus as SequenceEntryStatus['status'],
    };
    const requestedVersions = vi.fn();
    const authorizationHeaders: (string | null)[] = [];
    const statusRequests = vi.fn();
    testServer.use(
        http.get(
            `${testConfig.public.backendUrl}/${testOrganism}/get-data-to-edit/:accession/:version`,
            ({ request, params }) => {
                authorizationHeaders.push(request.headers.get('Authorization'));
                requestedVersions(params.version);
                if (params.version === '1' && state.failPrevious) return new HttpResponse(null, { status: 422 });
                if (
                    params.version === '2' &&
                    (state.failCurrent || state.status === receivedStatus || state.status === inProcessingStatus)
                ) {
                    // The backend fails while processed data is missing.
                    return new HttpResponse(null, { status: 500 });
                }
                return HttpResponse.json({
                    ...defaultReviewData,
                    accession: params.accession,
                    version: Number(params.version),
                    groupId: state.groupId,
                    errors: null,
                    warnings: null,
                    status: params.version === '1' ? 'APPROVED_FOR_RELEASE' : state.status,
                    processedData: {
                        ...defaultReviewData.processedData,
                        metadata: {
                            authors: params.version === '1' ? 'Old author' : state.authors,
                            country: 'Switzerland',
                        },
                        unalignedNucleotideSequences: state.sequences[String(params.version)],
                    },
                });
            },
        ),
        http.get(`${testConfig.public.backendUrl}/${testOrganism}/get-sequences`, ({ request }) => {
            const queries = new URL(request.url).searchParams;
            statusRequests({
                authorization: request.headers.get('Authorization'),
                groupIdsFilter: queries.get('groupIdsFilter'),
                statusesFilter: queries.get('statusesFilter'),
            });
            if (state.failStatusLookup) return new HttpResponse(null, { status: 503 });
            return HttpResponse.json({
                sequenceEntries: [{ ...revision, status: state.status, groupId: state.groupId }].filter(
                    (entry) =>
                        String(entry.groupId) === queries.get('groupIdsFilter') &&
                        queries.get('statusesFilter')?.split(',').includes(entry.status),
                ),
                statusCounts: {},
                processingResultCounts: {},
            });
        }),
    );
    return { state, requestedVersions, authorizationHeaders, statusRequests };
}

function renderCard(status = revision) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <ReviewCard
                sequenceEntryStatus={status}
                metadataDisplayNames={new Map()}
                clientConfig={testConfig.public}
                organism={testOrganism}
                accessToken={testAccessToken}
                referenceGenomesInfo={SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES}
                approveAccessionVersion={vi.fn()}
                deleteAccessionVersion={vi.fn()}
                editAccessionVersion={vi.fn()}
            />
        </QueryClientProvider>,
    );
}

function renderPage(referenceGenomesInfo = SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES) {
    return render(
        <RevisionDiffPage
            accessionVersion={revision}
            groupId={1}
            metadata={metadata}
            organism={testOrganism}
            clientConfig={testConfig.public}
            accessToken={testAccessToken}
            referenceGenomesInfo={referenceGenomesInfo}
        />,
    );
}

test('links to a separate page without fetching the baseline on the review card', async () => {
    const { state, requestedVersions } = mockVersions();
    const card = renderCard();
    await card.findByText(state.authors);
    expect(requestedVersions).not.toHaveBeenCalledWith('1');
    expect(card.getByRole('link', { name: 'View metadata changes for LOC_TEST.2' })).toHaveAttribute(
        'href',
        `/${testOrganism}/submission/1/review/LOC_TEST.2`,
    );
});

test('compares metadata with an unchanged-fields toggle', async () => {
    const { state, authorizationHeaders, statusRequests } = mockVersions();
    const user = userEvent.setup();
    const page = renderPage();
    expect(await page.findByText('Old author')).toBeVisible();
    expect(page.getByText(state.authors)).toBeVisible();
    expect(authorizationHeaders).toEqual([`Bearer ${testAccessToken}`, `Bearer ${testAccessToken}`]);
    expect(statusRequests).not.toHaveBeenCalled();
    expect(page.queryByRole('dialog')).not.toBeInTheDocument();
    expect(page.getByRole('link', { name: /Back to review/ })).toHaveAttribute(
        'href',
        `/${testOrganism}/submission/1/review`,
    );
    expect(page.queryByRole('row', { name: /Country/ })).not.toBeInTheDocument();
    expect(page.getByText('Hide unchanged fields (1)')).toBeVisible();
    await user.click(page.getByRole('checkbox', { name: 'Hide unchanged fields' }));
    expect(page.getByRole('row', { name: /Country Switzerland Switzerland/ })).toBeVisible();
    expect(page.queryByRole('checkbox', { name: 'Hide shared substitutions/indels' })).not.toBeInTheDocument();
});

test('shows an unavailable baseline as an error and lets the user retry', async () => {
    const { state } = mockVersions(true);
    const user = userEvent.setup();
    const page = renderPage();
    expect(await page.findByRole('alert')).toHaveTextContent('The previous version could not be loaded');
    expect(page.queryByRole('table')).not.toBeInTheDocument();
    state.failPrevious = false;
    await user.click(page.getByRole('button', { name: 'Retry' }));
    expect(await page.findByText('Old author')).toBeVisible();
});

test('reports sequence changes per segment for multi-segmented organisms', async () => {
    const { state } = mockVersions();
    // eslint-disable-next-line @typescript-eslint/naming-convention
    state.sequences = { 1: { S: 'AAA', L: 'CCC' }, 2: { S: 'AAA', L: null } };
    const page = renderPage(MULTI_SEG_SINGLE_REF_REFERENCEGENOMES);
    expect(await page.findByText(/Segment S/)).toHaveTextContent('Segment S: unchanged');
    expect(page.getByText(/Segment L/)).toHaveTextContent('Segment L: changed');
    expect(page.queryByText(/Nucleotide sequence/)).not.toBeInTheDocument();
});

test('shows an explicit empty state for identical metadata', async () => {
    const { state } = mockVersions();
    state.authors = 'Old author';
    expect(await renderPage().findByText('No metadata changes.')).toBeVisible();
});

test.each([
    { ...revision, version: 1 },
    { ...revision, isRevocation: true },
])('does not offer a diff for a first submission or revocation (%j)', (status) => {
    mockVersions();
    expect(renderCard(status).queryByRole('link', { name: /View metadata changes/ })).not.toBeInTheDocument();
});

test('disables comparison while the revision is awaiting processing', () => {
    const card = renderCard({ ...revision, status: receivedStatus });
    expect(card.getByRole('button', { name: /View metadata changes/ })).toBeDisabled();
    expect(card.queryByRole('link', { name: /View metadata changes/ })).not.toBeInTheDocument();
});

test.each([receivedStatus, inProcessingStatus] as const)(
    'handles a direct link while %s has no processed data and retries after processing',
    async (status) => {
        const { state, statusRequests } = mockVersions();
        state.status = status;
        const user = userEvent.setup();
        const page = renderPage();
        expect(await page.findByText(/This revision is still being processed/)).toBeVisible();
        expect(page.queryByRole('table')).not.toBeInTheDocument();
        expect(page.queryByRole('alert')).not.toBeInTheDocument();
        expect(statusRequests).toHaveBeenCalledWith({
            authorization: `Bearer ${testAccessToken}`,
            groupIdsFilter: '1',
            statusesFilter: 'RECEIVED,IN_PROCESSING',
        });
        state.status = processedStatus;
        await user.click(page.getByRole('button', { name: 'Retry' }));
        expect(await page.findByText('Old author')).toBeVisible();
        expect(page.queryByText(/This revision is still being processed/)).not.toBeInTheDocument();
    },
);

test('keeps a load error retryable when the status lookup also fails', async () => {
    const { state } = mockVersions();
    state.failCurrent = true;
    state.failStatusLookup = true;
    const user = userEvent.setup();
    const page = renderPage();
    expect(await page.findByRole('alert')).toHaveTextContent('The pending revision could not be loaded');
    expect(page.queryByRole('table')).not.toBeInTheDocument();
    state.failCurrent = false;
    await user.click(page.getByRole('button', { name: 'Retry' }));
    expect(await page.findByText('Old author')).toBeVisible();
});

test.each([
    { groupId: 2, status: 'PROCESSED', message: 'Revision not found in this group' },
    {
        groupId: 1,
        status: 'APPROVED_FOR_RELEASE',
        message: 'This revision is not awaiting review. Return to review to check its status.',
    },
])(
    'handles a direct link to another group or a revision already approved (%j)',
    async ({ groupId, status, message }) => {
        const { state } = mockVersions();
        Object.assign(state, { groupId, status });
        const page = renderPage();
        expect(await page.findByText(message)).toBeVisible();
        expect(page.queryByRole('table')).not.toBeInTheDocument();
        expect(page.getByRole('link', { name: /Back to review/ })).toBeVisible();
    },
);
