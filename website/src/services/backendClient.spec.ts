import { http } from 'msw';
import { describe, expect, test } from 'vitest';

import { BackendClient } from './backendClient.ts';
import { testConfig, testServer } from '../../vitest.setup.ts';
import type { ProblemDetail } from '../types/backend.ts';
import type { AddSeqSetCitationRequest } from '../types/seqSetCitation.ts';

const addCitationRequest: AddSeqSetCitationRequest = {
    source: {
        sourceDOI: '10.1234/citation',
        title: 'Citation title',
        year: 2026,
        contributors: [],
    },
    seqSetAccessionVersions: ['LOC_SS_1.1'],
};

const addCitationUrl = `${testConfig.serverSide.backendUrl}/admin/add-seqset-citation`;

const noopLogger = { error: () => undefined, info: () => undefined };
const createClient = () => new BackendClient(testConfig.serverSide.backendUrl, noopLogger);

describe('BackendClient', () => {
    test('returns a ProblemDetail received from the backend', async () => {
        const problemDetail: ProblemDetail = {
            title: 'Unprocessable Content',
            status: 422,
            detail: "Invalid accession version format 'LOC_SS_1'",
            instance: '/admin/add-seqset-citation',
        };
        testServer.use(
            http.post(
                addCitationUrl,
                () =>
                    new Response(JSON.stringify(problemDetail), {
                        status: problemDetail.status,
                        headers: [['Content-Type', 'application/problem+json']],
                    }),
            ),
        );

        const result = await createClient().addSeqSetCitation('access-token', addCitationRequest);

        expect(result._unsafeUnwrapErr()).toEqual(problemDetail);
    });

    test('uses the HTTP status when the error response is not a ProblemDetail', async () => {
        testServer.use(
            http.post(
                addCitationUrl,
                () =>
                    new Response(JSON.stringify({ message: 'Service unavailable' }), {
                        status: 503,
                        headers: [['Content-Type', 'application/json']],
                    }),
            ),
        );

        const result = await createClient().addSeqSetCitation('access-token', addCitationRequest);

        expect(result._unsafeUnwrapErr()).toEqual({
            type: 'about:blank',
            title: 'Request failed with status code 503',
            status: 503,
            detail: 'Unknown error from backend',
            instance: '/admin/add-seqset-citation',
        });
    });
});
