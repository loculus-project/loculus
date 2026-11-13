import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { SeqSetItemActions } from './SeqSetItemActions';
import { testConfig, testServer } from '../../../vitest.setup.ts';
import { SeqSetRecordType, type SeqSet } from '../../types/seqSetCitation';

const seqSet: SeqSet = {
    seqSetId: 'LOC_SS_1',
    seqSetVersion: 1,
    name: 'test seqSet',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'testuser',
};

const records = [
    { accession: 'LOC_000001.1', type: SeqSetRecordType.loculus, isFocal: true },
    { accession: 'LOC_000002.1', type: SeqSetRecordType.loculus, isFocal: false },
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

    test('enables the export download once the records are loaded', async () => {
        mockRecords(() => HttpResponse.json(records));
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'Export / Cite' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled());
    });

    test('shows an error instead of an empty edit form when the records fail to load', async () => {
        mockRecords(() => new HttpResponse(null, { status: 500 }));
        renderActions();

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        expect(await screen.findByText(/Failed to load SeqSet records/, {}, { timeout: 5000 })).toBeVisible();
        expect(screen.queryByLabelText(/Focal accessions/)).not.toBeInTheDocument();
    });
});
