import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { ALL } from './[...path].ts';
import { testServer } from '../../../../../vitest.setup.ts';

const lapisBaseUrl = 'http://lapis.dummy';
const testOrganism = 'testOrganism';

vi.mock('../../../../config.ts', () => ({
    getRuntimeConfig: vi.fn(() => ({
        serverSide: {
            backendUrl: 'http://backend.dummy',
            lapisUrls: {
                [testOrganism]: lapisBaseUrl,
            },
            keycloakUrl: 'http://authentication.dummy',
        },
        public: {
            lapisAuthEnabled: true,
        },
    })),
}));

type CapturedRequest = {
    url: string;
    method: string;
    headers: Headers;
    body: string | null;
};

/** A logged-in session as the auth middleware populates `locals.session`. */
const loggedInSession = {
    isLoggedIn: true,
    user: { username: 'testuser' },
    token: { accessToken: 'user-token', refreshToken: 'refresh-token' },
} as const;

function mockLapis(status: number = 200, body: unknown = { data: [], info: { dataVersion: '' } }) {
    const captured: CapturedRequest[] = [];
    testServer.use(
        http.all(`${lapisBaseUrl}/*`, async ({ request }) => {
            // Answer the CORS preflight like the default OPTIONS handler in vitest.setup.ts does.
            if (request.method === 'OPTIONS') {
                return new Response(null, {
                    status: 204,
                    headers: {
                        // eslint-disable-next-line @typescript-eslint/naming-convention
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
            captured.push({
                url: request.url,
                method: request.method,
                headers: request.headers,
                body: request.body === null ? null : await request.text(),
            });
            const headers: Record<string, string> = {};
            if (typeof body === 'string') {
                headers['Content-Type'] = 'text/plain';
            } else {
                headers['Content-Type'] = 'application/json';
            }
            if (status === 200) {
                headers['Content-Disposition'] = 'attachment; filename="download.fasta"';
            }
            return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
        }),
    );
    return captured;
}

function callProxy(path: string | undefined, request: Request, session: object | undefined = loggedInSession) {
    return ALL({
        params: { organism: testOrganism, path },
        request,
        locals: { session },
    } as unknown as Parameters<typeof ALL>[0]);
}

describe('LAPIS browser proxy route', () => {
    beforeEach(() => {
        testServer.resetHandlers();
    });

    test('answers 401 for anonymous callers and never contacts LAPIS', async () => {
        const captured = mockLapis();

        const response = await ALL({
            params: { organism: testOrganism, path: 'sample/details' },
            request: new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`),
            locals: { session: undefined },
        } as unknown as Parameters<typeof ALL>[0]);

        expect(response.status).toBe(401);
        const problemDetail = JSON.parse(await response.text());
        expect(problemDetail.title).toBe('Not logged in');
        expect(captured).toHaveLength(0);
    });

    test('when LAPIS auth is disabled, forwards anonymous requests without a token', async () => {
        const { getRuntimeConfig } = await import('../../../../config.ts');
        vi.mocked(getRuntimeConfig).mockReturnValueOnce({
            serverSide: {
                backendUrl: 'http://backend.dummy',
                lapisUrls: { [testOrganism]: lapisBaseUrl },
                keycloakUrl: 'http://authentication.dummy',
            },
            public: { lapisAuthEnabled: false },
        } as unknown as ReturnType<typeof getRuntimeConfig>);
        const captured = mockLapis();

        const response = await ALL({
            params: { organism: testOrganism, path: 'sample/details' },
            request: new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`),
            locals: { session: undefined },
        } as unknown as Parameters<typeof ALL>[0]);

        expect(response.status).toBe(200);
        expect(captured).toHaveLength(1);
        expect(captured[0].headers.get('authorization')).toBeNull();
    });

    test('forwards a GET request with its query string, attaches the user token, and streams the response through', async () => {
        const captured = mockLapis();

        const response = await callProxy(
            'sample/details',
            new Request(
                `http://localhost:3000/api/lapis/${testOrganism}/sample/details?dataFormat=json&fields=country,date`,
            ),
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(JSON.stringify({ data: [], info: { dataVersion: '' } }));
        // response headers (incl. download file names) are passed through
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="download.fasta"');
        expect(captured).toHaveLength(1);
        expect(captured[0].method).toBe('GET');
        expect(captured[0].body).toBeNull();
        // the raw query string is forwarded unchanged
        expect(captured[0].url).toBe(`${lapisBaseUrl}/sample/details?dataFormat=json&fields=country,date`);
        // the logged-in user's token is attached
        expect(captured[0].headers.get('authorization')).toBe('Bearer user-token');
    });

    test('forwards a POST request with its JSON body and content type', async () => {
        const captured = mockLapis();

        const response = await callProxy(
            'sample/details',
            new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details?dataFormat=json`, {
                method: 'POST',
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ country: 'Germany', dataFormat: 'json' }),
            }),
        );

        expect(response.status).toBe(200);
        expect(captured).toHaveLength(1);
        expect(captured[0].method).toBe('POST');
        expect(captured[0].body).toBe(JSON.stringify({ country: 'Germany', dataFormat: 'json' }));
        expect(captured[0].headers.get('content-type')).toBe('application/json');
    });

    test('passes LAPIS error responses (e.g. 400) through unmodified', async () => {
        mockLapis(400, { error: { title: 'Bad Request', detail: 'unknown metadata field' } });

        const response = await callProxy(
            'sample/details',
            new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`, {
                method: 'POST',
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ nonsense: true }),
            }),
        );

        expect(response.status).toBe(400);
        expect(JSON.parse(await response.text())).toEqual({
            error: { title: 'Bad Request', detail: 'unknown metadata field' },
        });
    });

    test('maps a 401 from LAPIS to a clear 502 problem detail', async () => {
        mockLapis(401, { error: { detail: 'unauthorized' } });

        const response = await callProxy(
            'sample/details',
            new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`, { method: 'POST' }),
        );

        expect(response.status).toBe(502);
        const problemDetail = JSON.parse(await response.text());
        expect(problemDetail.status).toBe(502);
        expect(problemDetail.detail).toContain('401');
    });

    test('maps a 403 from LAPIS to a clear 502 problem detail', async () => {
        mockLapis(403, { error: { detail: 'forbidden' } });

        const response = await callProxy(
            'sample/details',
            new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`, { method: 'POST' }),
        );

        expect(response.status).toBe(502);
        expect(JSON.parse(await response.text()).detail).toContain('403');
    });

    test('hints at a website/LAPIS auth-flag mismatch when no token was forwarded', async () => {
        // LAPIS has auth enabled, but the website's (e.g. stale) runtime config says off, so the
        // proxy forwards without an Authorization header and LAPIS rejects the request.
        const { getRuntimeConfig } = await import('../../../../config.ts');
        vi.mocked(getRuntimeConfig).mockReturnValueOnce({
            serverSide: {
                backendUrl: 'http://backend.dummy',
                lapisUrls: { [testOrganism]: lapisBaseUrl },
                keycloakUrl: 'http://authentication.dummy',
            },
            public: { lapisAuthEnabled: false },
        } as unknown as ReturnType<typeof getRuntimeConfig>);
        mockLapis(401, { error: { detail: 'Authentication required' } });

        const response = await callProxy(
            'sample/details',
            new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`, { method: 'POST' }),
        );

        expect(response.status).toBe(502);
        const problemDetail = JSON.parse(await response.text());
        expect(problemDetail.detail).toContain('no Authorization header');
        expect(problemDetail.detail).toContain('out of sync');
    });

    test('returns 502 when LAPIS cannot be reached', async () => {
        testServer.use(
            http.all(`${lapisBaseUrl}/*`, ({ request }) => {
                if (request.method === 'OPTIONS') {
                    return new Response(null, {
                        status: 204,
                        headers: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            'Access-Control-Allow-Origin': '*',
                        },
                    });
                }
                return HttpResponse.error();
            }),
        );

        const response = await callProxy(
            'sample/details',
            new Request(`http://localhost:3000/api/lapis/${testOrganism}/sample/details`, { method: 'POST' }),
        );

        expect(response.status).toBe(502);
        const problemDetail = JSON.parse(await response.text());
        expect(problemDetail.title).toBe('Could not reach LAPIS');
        // the internal LAPIS URL must not leak into the browser-visible response
        expect(JSON.stringify(problemDetail)).not.toContain(lapisBaseUrl);
    });

    test('returns 404 for an organism without a configured LAPIS URL', async () => {
        const response = await ALL({
            params: { organism: 'unknown-organism', path: 'sample/details' },
            request: new Request('http://localhost:3000/api/lapis/unknown-organism/sample/details'),
            locals: { session: loggedInSession },
        } as unknown as Parameters<typeof ALL>[0]);

        expect(response.status).toBe(404);
        expect(JSON.parse(await response.text()).detail).toContain('unknown-organism');
    });
});
