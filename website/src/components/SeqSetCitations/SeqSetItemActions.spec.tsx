import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'react-toastify';
import { describe, expect, test, vi } from 'vitest';

import { SeqSetItemActions } from './SeqSetItemActions';
import { testConfig, testServer } from '../../../vitest.setup.ts';
import type { SeqSet } from '../../types/seqSetCitation';

const seqSet: SeqSet = {
    seqSetId: 'LOC_SS_1',
    seqSetVersion: 1,
    name: 'test seqSet',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'testuser',
};

const records = [
    { accession: 'LOC_000001.1', isFocal: true },
    { accession: 'LOC_000002.1', isFocal: false },
];

function mockRecords(response: () => Response) {
    let requestCount = 0;
    testServer.use(
        http.get(`${testConfig.public.backendUrl}/get-seqset-records`, () => {
            requestCount++;
            return response();
        }),
    );
    return () => requestCount;
}

function renderActions() {
    render(
        <SeqSetItemActions
            clientConfig={testConfig.public}
            accessToken='token'
            seqSet={seqSet}
            isAdminView
            databaseName='testDatabase'
        />,
    );
}

describe('SeqSetItemActions', () => {
    test('does not request the records until edit or export is opened', async () => {
        const getRequestCount = mockRecords(() => HttpResponse.json(records));
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'More details' }));
        await screen.findByText('Creator details');

        expect(getRequestCount()).toBe(0);
    });

    test('fills the edit form with the fetched records', async () => {
        const getRequestCount = mockRecords(() => HttpResponse.json(records));
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(await screen.findByLabelText(/Focal accessions/)).toHaveValue('LOC_000001.1');
        expect(screen.getByLabelText(/Background accessions/)).toHaveValue('LOC_000002.1');
        expect(getRequestCount()).toBe(1);
    });

    test('export requests the records only when downloading', async () => {
        const getRequestCount = mockRecords(() => HttpResponse.json(records));
        const downloadedHrefs: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            downloadedHrefs.push(this.href);
        });
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'Export / Cite' }));
        const downloadButton = await screen.findByRole('button', { name: 'Download' });
        expect(getRequestCount()).toBe(0);

        await userEvent.click(downloadButton);

        await waitFor(() => expect(downloadedHrefs).toHaveLength(1));
        expect(decodeURIComponent(downloadedHrefs[0])).toContain('LOC_000002.1');
        expect(getRequestCount()).toBe(1);
    });

    test('export shows an error when the records fail to load', async () => {
        mockRecords(() => new HttpResponse(null, { status: 500 }));
        const toastError = vi.spyOn(toast, 'error');
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'Export / Cite' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Download' }));

        await waitFor(
            () =>
                expect(toastError).toHaveBeenCalledWith(
                    expect.stringContaining('Failed to load SeqSet records'),
                    expect.anything(),
                ),
            { timeout: 4000 },
        );
    });

    test('shows an error instead of an empty edit form when the records fail to load', async () => {
        mockRecords(() => new HttpResponse(null, { status: 500 }));
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(await screen.findByText(/Failed to load SeqSet records/, {}, { timeout: 5000 })).toBeVisible();
        expect(screen.queryByLabelText(/Focal accessions/)).not.toBeInTheDocument();
    });
});
