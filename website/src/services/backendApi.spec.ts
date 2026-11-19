import { http } from 'msw';
import { describe, expect, test } from 'vitest';

import { extractProblemDetail } from './apiRequest.ts';
import { backendApi } from './backendApi.ts';
import { testConfig, testServer } from '../../vitest.setup.ts';
import type { ProblemDetail } from '../types/backend.ts';

const validateUrl = `${testConfig.serverSide.backendUrl}/validate-seqset-records`;
const records = [{ accession: 'LOC_000001Y.1', type: 'loculus', isFocal: true }];

const createApi = () => backendApi(testConfig.serverSide.backendUrl, 'access-token');

describe('validateSeqSetRecords', () => {
    test('succeeds when the backend accepts the records with an empty body', async () => {
        // The backend returns 200 without a body (and without a Content-Type) for valid records
        testServer.use(http.post(validateUrl, () => new Response(null, { status: 200 })));

        await expect(createApi().validateSeqSetRecords(records)).resolves.toBeUndefined();
    });

    test('fails with the problem detail when the backend rejects the records', async () => {
        const problemDetail: ProblemDetail = {
            title: 'Unprocessable Content',
            status: 422,
            detail: 'Accession versions LOC_000001Y.1 do not exist',
            instance: '/validate-seqset-records',
        };
        testServer.use(
            http.post(
                validateUrl,
                () =>
                    new Response(JSON.stringify(problemDetail), {
                        status: 422,
                        headers: [['Content-Type', 'application/problem+json']],
                    }),
            ),
        );

        const error = await createApi()
            .validateSeqSetRecords(records)
            .catch((error: unknown) => error);

        expect(extractProblemDetail(error)).toEqual(problemDetail);
    });
});
