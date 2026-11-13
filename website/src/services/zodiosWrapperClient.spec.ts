import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { SeqSetCitationClient } from './seqSetCitationClient.ts';
import { testConfig, testServer } from '../../vitest.setup.ts';

const recordsUrl = `${testConfig.serverSide.backendUrl}/get-seqset-records`;
const params = { params: { seqSetId: 'LOC_SS_1', version: '1' } };

describe('ZodiosWrapperClient response validation', () => {
    test('returns the response parsed by the endpoint schema, without unknown fields', async () => {
        testServer.use(
            http.get(recordsUrl, () =>
                HttpResponse.json([{ seqSetRecordId: 7, accession: 'LOC_1.1', type: 'Loculus', isFocal: true }]),
            ),
        );

        const result = await SeqSetCitationClient.create(testConfig.serverSide.backendUrl).call(
            'getSeqSetRecords',
            params,
        );

        expect(result._unsafeUnwrap()).toEqual([{ accession: 'LOC_1.1', type: 'Loculus', isFocal: true }]);
    });

    test('returns an error when the response does not match the endpoint schema', async () => {
        testServer.use(http.get(recordsUrl, () => HttpResponse.json([{ accession: 'LOC_1.1' }])));

        const result = await SeqSetCitationClient.create(testConfig.serverSide.backendUrl).call(
            'getSeqSetRecords',
            params,
        );

        expect(result._unsafeUnwrapErr()).toMatchObject({
            status: 0,
            detail: 'Unexpected response format from backend',
            instance: 'getSeqSetRecords',
        });
    });

    test('does not validate non-JSON responses', async () => {
        testServer.use(http.get(recordsUrl, () => new HttpResponse('not json', { status: 200 })));

        const result = await SeqSetCitationClient.create(testConfig.serverSide.backendUrl).call(
            'getSeqSetRecords',
            params,
        );

        expect(result.isOk()).toBe(true);
    });

    test('keeps the error of the service for failed requests', async () => {
        testServer.use(
            http.get(recordsUrl, () =>
                HttpResponse.json(
                    { type: 'about:blank', title: 'Not Found', status: 404, detail: 'no such seqSet', instance: '/x' },
                    { status: 404 },
                ),
            ),
        );

        const result = await SeqSetCitationClient.create(testConfig.serverSide.backendUrl).call(
            'getSeqSetRecords',
            params,
        );

        expect(result._unsafeUnwrapErr()).toMatchObject({ status: 404, detail: 'no such seqSet' });
    });
});
