import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, test, vi } from 'vitest';

import { ReviewCard } from './ReviewCard';
import { defaultReviewData, testAccessToken, testConfig, testOrganism, testServer } from '../../../vitest.setup';
import { processedStatus, receivedStatus, type SequenceEntryStatus } from '../../types/backend';
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
const diffButton = { name: /View metadata changes/ };

function mockVersions(failPrevious = false) {
    const state = {
        authors: 'Old author; New author',
        sequences: { 1: { main: 'ACGT' }, 2: { main: 'ACGT' } } as Record<string, Record<string, string | null>>,
        failPrevious,
    };
    const requestedVersions = vi.fn();
    testServer.use(
        http.get(
            `${testConfig.public.backendUrl}/${testOrganism}/get-data-to-edit/:accession/:version`,
            ({ request, params }) => {
                requestedVersions(params.version, request.headers.get('Authorization'));
                if (params.version === '1' && state.failPrevious) return new HttpResponse(null, { status: 422 });
                return HttpResponse.json({
                    ...defaultReviewData,
                    accession: params.accession,
                    version: Number(params.version),
                    groupId: 1,
                    errors: null,
                    warnings: null,
                    status: params.version === '1' ? 'APPROVED_FOR_RELEASE' : processedStatus,
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
    );
    return { state, requestedVersions };
}

function renderCard(status = revision, referenceGenomesInfo = SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <ReviewCard
                sequenceEntryStatus={status}
                metadata={metadata}
                metadataDisplayNames={new Map()}
                clientConfig={testConfig.public}
                organism={testOrganism}
                accessToken={testAccessToken}
                referenceGenomesInfo={referenceGenomesInfo}
                approveAccessionVersion={vi.fn()}
                deleteAccessionVersion={vi.fn()}
                editAccessionVersion={vi.fn()}
            />
        </QueryClientProvider>,
    );
}

test('shows the metadata diff inline by default and lets the user collapse it', async () => {
    const { requestedVersions } = mockVersions();
    const user = userEvent.setup();
    const card = renderCard();
    expect(await card.findByText('Old author')).toBeVisible();
    expect(requestedVersions).toHaveBeenCalledWith('1', `Bearer ${testAccessToken}`);
    expect(card.getByText(/Nucleotide sequence/)).toHaveTextContent('Nucleotide sequence: unchanged');
    expect(card.queryByRole('row', { name: /Country/ })).not.toBeInTheDocument();
    expect(card.getByText('Hide unchanged fields (1)')).toBeVisible();
    await user.click(card.getByRole('checkbox', { name: 'Hide unchanged fields' }));
    expect(card.getByRole('row', { name: /Country Switzerland Switzerland/ })).toBeVisible();
    expect(card.queryByRole('checkbox', { name: 'Hide shared substitutions/indels' })).not.toBeInTheDocument();
    await user.click(card.getByRole('button', diffButton));
    expect(card.queryByRole('table')).not.toBeInTheDocument();
    await user.click(card.getByRole('button', diffButton));
    expect(card.getByRole('table')).toBeVisible();
});

test('shows an unavailable baseline as an error and lets the user retry', async () => {
    const { state } = mockVersions(true);
    const user = userEvent.setup();
    const card = renderCard();
    expect(await card.findByRole('alert')).toHaveTextContent('The previous version could not be loaded');
    expect(card.queryByRole('table')).not.toBeInTheDocument();
    state.failPrevious = false;
    await user.click(card.getByRole('button', { name: 'Retry' }));
    expect(await card.findByText('Old author')).toBeVisible();
});

test('reports sequence changes per segment for multi-segmented organisms', async () => {
    const { state } = mockVersions();
    // eslint-disable-next-line @typescript-eslint/naming-convention
    state.sequences = { 1: { S: 'AAA', L: 'CCC' }, 2: { S: 'AAA', L: null } };
    const card = renderCard(revision, MULTI_SEG_SINGLE_REF_REFERENCEGENOMES);
    expect(await card.findByText(/Segment S/)).toHaveTextContent('Segment S: unchanged');
    expect(card.getByText(/Segment L/)).toHaveTextContent('Segment L: changed');
    expect(card.queryByText(/Nucleotide sequence/)).not.toBeInTheDocument();
});

test('shows an explicit empty state for identical metadata', async () => {
    const { state } = mockVersions();
    state.authors = 'Old author';
    expect(await renderCard().findByText('No metadata changes.')).toBeVisible();
});

test.each([
    { ...revision, version: 1 },
    { ...revision, isRevocation: true },
])('does not offer a diff for a first submission or revocation (%j)', async (status) => {
    const { requestedVersions } = mockVersions();
    const card = renderCard(status);
    if (!status.isRevocation) await card.findByText('Switzerland');
    expect(card.queryByRole('button', diffButton)).not.toBeInTheDocument();
    expect(requestedVersions).not.toHaveBeenCalledWith(String(status.version - 1), expect.anything());
});

test('disables the diff while the revision is awaiting processing', async () => {
    mockVersions();
    const pending = within(renderCard({ ...revision, status: receivedStatus }).container);
    const processed = within(renderCard().container);
    await waitFor(() => expect(processed.getByRole('button', diffButton)).toBeEnabled());
    expect(pending.getByRole('button', diffButton)).toBeDisabled();
});
