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

const metadataSchema: Metadata[] = [
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

function reviewData() {
    return {
        metadata: { authors: 'Old author; New author', country: 'Switzerland' },
        errors: null,
        warnings: null,
        files: null,
        revision: {
            previousVersion: 1,
            previousMetadata: { authors: 'Old author', country: 'Switzerland' },
            nucleotideChanges: { main: { changed: false, previousLength: 4, currentLength: 4 } },
        },
    };
}

function trackSequenceRequests() {
    const requestedVersions = vi.fn();
    testServer.use(
        http.get(
            `${testConfig.public.backendUrl}/${testOrganism}/get-data-to-edit/:accession/:version`,
            ({ params }) => {
                requestedVersions(params.version);
                return HttpResponse.json(defaultReviewData);
            },
        ),
    );
    return requestedVersions;
}

function renderCard(
    status = { ...revision, reviewData: reviewData() } as SequenceEntryStatus,
    referenceGenomesInfo = SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <ReviewCard
                sequenceEntryStatus={status}
                metadataSchema={metadataSchema}
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

test('shows the metadata diff on request without fetching sequences', async () => {
    const requestedVersions = trackSequenceRequests();
    const user = userEvent.setup();
    const card = renderCard();
    expect(card.queryByRole('table')).not.toBeInTheDocument();
    await user.click(card.getByRole('button', diffButton));
    expect(await card.findByText('Old author')).toBeVisible();
    expect(requestedVersions).not.toHaveBeenCalled();
    expect(card.queryByRole('row', { name: /Country/ })).not.toBeInTheDocument();
    expect(card.getByText('Hide unchanged fields (2)')).toBeVisible();
    await user.click(card.getByRole('checkbox', { name: 'Hide unchanged fields' }));
    expect(card.getByRole('row', { name: /Country Switzerland Switzerland/ })).toBeVisible();
    expect(card.getByRole('row', { name: 'Nucleotide sequence 4 nt 4 nt' })).toBeVisible();
    expect(card.queryByRole('checkbox', { name: 'Hide shared substitutions/indels' })).not.toBeInTheDocument();
    await user.click(card.getByRole('button', diffButton));
    expect(card.queryByRole('table')).not.toBeInTheDocument();
    await user.click(card.getByRole('button', diffButton));
    expect(card.getByRole('table')).toBeVisible();
});

test('shows a neutral message when no processed baseline is available', async () => {
    const requestedVersions = trackSequenceRequests();
    const data = reviewData();
    const card = renderCard(
        {
            ...revision,
            reviewData: {
                ...data,
                revision: { ...data.revision, previousMetadata: null, nucleotideChanges: {} },
            },
        },
        SINGLE_SEG_SINGLE_REF_REFERENCEGENOMES,
    );
    await userEvent.click(card.getByRole('button', diffButton));
    expect(await card.findByText('No previous version is available for comparison.')).toBeVisible();
    expect(card.queryByRole('alert')).not.toBeInTheDocument();
    expect(card.queryByRole('table')).not.toBeInTheDocument();
    expect(card.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(requestedVersions).not.toHaveBeenCalled();
});

test('shows metadata differences when sequence comparison data is unavailable', async () => {
    const data = reviewData();
    const card = renderCard({
        ...revision,
        reviewData: { ...data, revision: { ...data.revision, nucleotideChanges: {} } },
    });
    await userEvent.click(card.getByRole('button', diffButton));
    expect(await card.findByText('Old author')).toBeVisible();
    expect(card.queryByRole('row', { name: /Nucleotide sequence/ })).not.toBeInTheDocument();
});

test('reports sequence changes per segment for multi-segmented organisms', async () => {
    const data = reviewData();
    const card = renderCard(
        {
            ...revision,
            reviewData: {
                ...data,
                revision: {
                    ...data.revision,
                    nucleotideChanges: Object.fromEntries([
                        ['S', { changed: false, previousLength: 3, currentLength: 3 }],
                        ['L', { changed: true, previousLength: 3, currentLength: null }],
                    ]),
                },
            },
        },
        MULTI_SEG_SINGLE_REF_REFERENCEGENOMES,
    );
    await userEvent.click(card.getByRole('button', diffButton));
    expect(await card.findByRole('row', { name: 'Segment L 3 nt' })).toBeVisible();
    expect(card.queryByRole('row', { name: /Segment S|Nucleotide sequence/ })).not.toBeInTheDocument();
    await userEvent.click(card.getByRole('checkbox', { name: 'Hide unchanged fields' }));
    expect(card.getByRole('row', { name: 'Segment S 3 nt 3 nt' })).toBeVisible();
});

test('shows an explicit empty state for identical metadata', async () => {
    const data = reviewData();
    data.metadata.authors = 'Old author';
    const card = renderCard({ ...revision, reviewData: data });
    await userEvent.click(card.getByRole('button', diffButton));
    expect(await card.findByText('No metadata changes.')).toBeVisible();
});

test('flags a same-length sequence edit as changed', async () => {
    const data = reviewData();
    data.metadata.authors = 'Old author';
    data.revision.nucleotideChanges.main.changed = true;
    const card = renderCard({ ...revision, reviewData: data });
    await userEvent.click(card.getByRole('button', diffButton));
    expect(await card.findByText('No metadata changes.')).toBeVisible();
    expect(card.getByRole('row', { name: 'Nucleotide sequence 4 nt 4 nt changed' })).toBeVisible();
});

test('uses the baseline version supplied by the backend after a revocation', async () => {
    const requestedVersions = trackSequenceRequests();
    const card = renderCard({ ...revision, version: 3, reviewData: reviewData() });
    await userEvent.click(card.getByRole('button', diffButton));
    expect(await card.findByRole('columnheader', { name: 'Version 1' })).toBeVisible();
    expect(card.getByRole('columnheader', { name: 'Version 3' })).toBeVisible();
    expect(requestedVersions).not.toHaveBeenCalled();
});

test.each([
    { ...revision, version: 1 },
    { ...revision, isRevocation: true },
])('does not offer a diff for a first submission or revocation (%j)', async (status) => {
    const requestedVersions = trackSequenceRequests();
    const card = renderCard({
        ...status,
        reviewData: status.isRevocation ? undefined : { ...reviewData(), revision: null },
    });
    if (!status.isRevocation) await card.findByText('Switzerland');
    expect(card.queryByRole('button', diffButton)).not.toBeInTheDocument();
    expect(requestedVersions).not.toHaveBeenCalled();
});

test('disables the diff while the revision is awaiting processing', async () => {
    const pending = within(renderCard({ ...revision, status: receivedStatus }).container);
    const processed = within(renderCard().container);
    await waitFor(() => expect(processed.getByRole('button', diffButton)).toBeEnabled());
    expect(pending.getByRole('button', diffButton)).toBeDisabled();
});
