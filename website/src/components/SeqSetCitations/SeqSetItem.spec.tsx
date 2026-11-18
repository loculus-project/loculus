import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { SEQSET_RECORDS_PER_PAGE, SeqSetItem } from './SeqSetItem';
import { testConfig, testOrganism, testServer } from '../../../vitest.setup.ts';
import { SeqSetRecordType, type SeqSet } from '../../types/seqSetCitation';

const seqSet: SeqSet = {
    seqSetId: 'LOC_SS_1',
    seqSetVersion: 1,
    name: 'test seqSet',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'testuser',
};

const records = Array.from({ length: 25 }, (_, i) => ({
    accession: `LOC_${String(i).padStart(6, '0')}.1`,
    type: SeqSetRecordType.loculus,
    isFocal: true,
}));

function renderItem() {
    let recordRequestCount = 0;
    testServer.use(
        http.get(`${testConfig.public.backendUrl}/get-seqset-records`, () => {
            recordRequestCount++;
            return HttpResponse.json(records);
        }),
        http.post(`${testConfig.public.lapisUrls[testOrganism]}/sample/details`, () => HttpResponse.json({ data: [] })),
    );
    render(
        <SeqSetItem
            clientConfig={testConfig.public}
            accessToken='token'
            seqSetAccessionVersion='LOC_SS_1.1'
            seqSet={seqSet}
            seqSetRecordCount={records.length}
            firstPageSeqSetRecords={records.slice(0, SEQSET_RECORDS_PER_PAGE)}
            seqSetCitations={[]}
            seqSetGraphs={[]}
            seqSetGraphsData={{}}
        />,
    );
    return () => recordRequestCount;
}

describe('SeqSetItem', () => {
    test('shows the first page and the total count without requesting the records', async () => {
        const getRecordRequestCount = renderItem();

        expect(await screen.findByText('LOC_000000.1')).toBeVisible();
        expect(screen.getByText('25 sequences')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Go to page 3' })).toBeVisible();
        expect(screen.queryByText('LOC_000010.1')).not.toBeInTheDocument();
        expect(getRecordRequestCount()).toBe(0);
    });

    test('fetches the records once when leaving the first page', async () => {
        const getRecordRequestCount = renderItem();

        await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
        expect(await screen.findByText('LOC_000010.1')).toBeVisible();
        expect(screen.queryByText('LOC_000000.1')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));
        expect(await screen.findByText('LOC_000024.1')).toBeVisible();
        expect(getRecordRequestCount()).toBe(1);
    });
});
