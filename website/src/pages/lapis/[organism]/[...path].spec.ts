import type { APIContext } from 'astro';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { GET, HEAD, POST } from './[...path]';

const lapisUrl = 'http://loculus-lapis-service-ebola:8080';

const { mockConfig } = vi.hoisted(() => ({ mockConfig: { requireLogin: false } }));

vi.mock('../../../config.ts', () => ({
    loginIsRequired: () => mockConfig.requireLogin,
    getRuntimeConfig: () => ({
        serverSide: { lapisUrls: { ebola: 'http://loculus-lapis-service-ebola:8080' } },
    }),
    getLapisUrl: (serviceConfig: { lapisUrls: Record<string, string> }, organism: string) => {
        if (!(organism in serviceConfig.lapisUrls)) {
            throw new Error(`No lapis url configured for organism ${organism}`);
        }
        return serviceConfig.lapisUrls[organism];
    },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    mockConfig.requireLogin = false;
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{"data":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
});

const loggedIn: Session = { isLoggedIn: true, user: { username: 'testuser' } };
const loggedOut: Session = { isLoggedIn: false };

type CallOptions = {
    organism?: string;
    path?: string;
    search?: string;
    session?: Session;
    headers?: HeadersInit;
    body?: string;
};

async function callRoute(method: 'GET' | 'HEAD' | 'POST', options: CallOptions = {}): Promise<Response> {
    const { organism = 'ebola', path = 'sample/details', search = '', session = loggedOut, headers, body } = options;
    const url = new URL(`https://loculus.example.org/lapis/${organism}/${path}${search}`);
    const request = new Request(url, { method, headers, body });
    const handler = method === 'GET' ? GET : method === 'HEAD' ? HEAD : POST;

    return handler({ params: { organism, path }, request, locals: { session }, url } as unknown as APIContext);
}

const lapisCall = () => {
    expect(fetchMock).toHaveBeenCalledOnce();
    return { url: fetchMock.mock.calls[0][0] as string, init: fetchMock.mock.calls[0][1]! };
};
const lapisRequestHeaders = () => new Headers(lapisCall().init.headers);

describe('LAPIS proxy route', () => {
    test('forwards path and query string to the internal LAPIS of the organism', async () => {
        await callRoute('GET', { path: 'sample/aggregated', search: '?country=Uganda&limit=10' });

        expect(lapisCall().url).toBe(`${lapisUrl}/sample/aggregated?country=Uganda&limit=10`);
    });

    test('passes the response body and status through', async () => {
        fetchMock.mockResolvedValue(new Response('sequence-data', { status: 200 }));

        const response = await callRoute('GET');

        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toBe('sequence-data');
    });

    test('forwards the request body and content type on POST', async () => {
        await callRoute('POST', {
            body: '{"accession":"LOC_0001"}',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { 'Content-Type': 'application/json' },
        });

        const { init } = lapisCall();
        expect(init.method).toBe('POST');
        expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"accession":"LOC_0001"}');
        expect(lapisRequestHeaders().get('Content-Type')).toBe('application/json');
    });

    test('proxies HEAD requests', async () => {
        await callRoute('HEAD');

        expect(lapisCall().init.method).toBe('HEAD');
    });

    describe('when the instance requires login', () => {
        beforeEach(() => {
            mockConfig.requireLogin = true;
        });

        test('rejects anonymous requests without asking LAPIS', async () => {
            const response = await callRoute('GET', { session: loggedOut });

            expect(response.status).toBe(401);
            expect(response.headers.get('Content-Type')).toBe('application/problem+json');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('rejects requests that have no session at all', async () => {
            const response = await callRoute('GET', { session: undefined });

            expect(response.status).toBe(401);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        test('serves logged in users', async () => {
            const response = await callRoute('GET', { session: loggedIn });

            expect(response.status).toBe(200);
            expect(fetchMock).toHaveBeenCalledOnce();
        });
    });

    test('serves anonymous requests when the instance does not require login', async () => {
        const response = await callRoute('GET', { session: loggedOut });

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    test('does not leak session credentials to LAPIS', async () => {
        await callRoute('GET', {
            session: loggedIn,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { Cookie: 'access_token=secret; refresh_token=secret', Authorization: 'Bearer secret' },
        });

        expect(lapisRequestHeaders().get('Cookie')).toBeNull();
        expect(lapisRequestHeaders().get('Authorization')).toBeNull();
    });

    test('asks LAPIS for uncompressed bytes regardless of what the browser accepts', async () => {
        await callRoute('GET', { headers: new Headers([['accept-encoding', 'gzip, br']]) });

        expect(lapisRequestHeaders().get('Accept-Encoding')).toBe('identity');
    });

    test('drops content-encoding that fetch already decoded, so the browser does not decode twice', async () => {
        fetchMock.mockResolvedValue(
            // fetch() hands us a decoded body but keeps the upstream header, see ENCODINGS_DECODED_BY_FETCH
            // eslint-disable-next-line @typescript-eslint/naming-convention
            new Response('decoded', { status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '42' } }),
        );

        const response = await callRoute('GET');

        expect(response.headers.get('Content-Encoding')).toBeNull();
        expect(response.headers.get('Content-Length')).toBeNull();
    });

    test('keeps content-encoding that fetch does not decode, so zstd downloads stay intact', async () => {
        fetchMock.mockResolvedValue(
            // eslint-disable-next-line @typescript-eslint/naming-convention
            new Response('compressed', { status: 200, headers: { 'Content-Encoding': 'zstd' } }),
        );

        const response = await callRoute('GET');

        expect(response.headers.get('Content-Encoding')).toBe('zstd');
    });

    test('keeps the headers that drive file downloads', async () => {
        fetchMock.mockResolvedValue(
            new Response('>seq', {
                status: 200,
                headers: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Content-Disposition': 'attachment; filename="ebola.fasta"',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'Lapis-Data-Version': '1700000000',
                },
            }),
        );

        const response = await callRoute('GET');

        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="ebola.fasta"');
        expect(response.headers.get('Lapis-Data-Version')).toBe('1700000000');
    });

    test('passes LAPIS error responses through unchanged', async () => {
        fetchMock.mockResolvedValue(new Response('{"error":{"detail":"bad filter"}}', { status: 400 }));

        const response = await callRoute('GET');

        expect(response.status).toBe(400);
        await expect(response.text()).resolves.toBe('{"error":{"detail":"bad filter"}}');
    });

    test('returns 404 for an organism that has no LAPIS', async () => {
        const response = await callRoute('GET', { organism: 'not-an-organism' });

        expect(response.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('returns 502 when LAPIS cannot be reached', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        const response = await callRoute('GET');

        expect(response.status).toBe(502);
    });
});
