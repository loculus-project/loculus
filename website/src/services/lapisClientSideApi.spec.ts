import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { fetchDetailsFromLapis } from './lapisClientSideApi.ts';
import { testOrganism, testServer } from '../../vitest.setup.ts';

/**
 * In deployed instances the public `lapisUrls` point at the same-origin LAPIS proxy
 * (`/api/lapis/<organism>`, see `src/pages/api/lapis/[organism]/[...path].ts`). These tests
 * verify that the browser-side LAPIS traffic (browser axios, not the server-side `LapisClient`)
 * works with such relative URLs.
 */
describe('fetchDetailsFromLapis', () => {
    test('accepts a same-origin relative LAPIS URL as used by the website LAPIS proxy', async () => {
        const relativeLapisUrl = `/api/lapis/${testOrganism}`;
        testServer.use(
            http.post(`${relativeLapisUrl}/sample/details`, ({ request }) => {
                // the relative URL must resolve against the website's own origin
                expect(request.url).toBe(`http://localhost:3000${relativeLapisUrl}/sample/details`);
                return HttpResponse.json({
                    data: [{ country: 'Germany' }],
                    info: { dataVersion: '2025-01-01' },
                });
            }),
        );

        const result = await fetchDetailsFromLapis(relativeLapisUrl, { country: 'Germany' });

        expect(result.data).toEqual([{ country: 'Germany' }]);
    });
});
