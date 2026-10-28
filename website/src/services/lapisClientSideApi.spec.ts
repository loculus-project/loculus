import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { fetchDetailsFromLapis } from './lapisClientSideApi.ts';
import { testOrganism, testServer } from '../../vitest.setup.ts';

describe('fetchDetailsFromLapis', () => {
    test('attaches the access token as Authorization header when one is given', async () => {
        const lapisUrl = `http://lapis.dummy/${testOrganism}`;
        testServer.use(
            http.post(`${lapisUrl}/sample/details`, ({ request }) => {
                expect(request.headers.get('Authorization')).toBe('Bearer some-token');
                return HttpResponse.json({
                    data: [{ country: 'Germany' }],
                    info: { dataVersion: '2025-01-01' },
                });
            }),
        );

        const result = await fetchDetailsFromLapis(lapisUrl, { country: 'Germany' }, 'some-token');

        expect(result.data).toEqual([{ country: 'Germany' }]);
    });

    test('sends no Authorization header without an access token', async () => {
        const lapisUrl = `http://lapis.dummy/${testOrganism}`;
        testServer.use(
            http.post(`${lapisUrl}/sample/details`, ({ request }) => {
                expect(request.headers.has('Authorization')).toBe(false);
                return HttpResponse.json({
                    data: [{ country: 'Germany' }],
                    info: { dataVersion: '2025-01-01' },
                });
            }),
        );

        const result = await fetchDetailsFromLapis(lapisUrl, { country: 'Germany' }, undefined);

        expect(result.data).toEqual([{ country: 'Germany' }]);
    });
});
