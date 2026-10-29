import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { GET } from './[fileName]';

vi.mock('../../../../config', () => ({
    getRuntimeConfig: () => ({ serverSide: { backendUrl: 'http://backend:8079' } }),
}));

const s3Url = 'https://s3.example.org/bucket/files/some-file-id?X-Amz-Signature=abc';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 307, headers: new Headers([['Location', s3Url]]) }));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function callRoute(session: Session, requestHeaders: Record<string, string> = {}): Promise<Response> {
    const params = { accessionVersion: 'LOC_0001.1', fileCategory: 'rawReads', fileName: 'reads.fastq.gz' };
    const request = new Request('http://website/seq/LOC_0001.1/rawReads/reads.fastq.gz', { headers: requestHeaders });
    return GET({ params, locals: { session }, request } as unknown as APIContext) as Promise<Response>;
}

const backendRequest = () => {
    expect(fetchMock).toHaveBeenCalledOnce();
    return fetchMock.mock.calls[0][1]!;
};
const authHeader = () => new Headers(backendRequest().headers).get('Authorization');

describe('file download proxy route', () => {
    test('does not send an Authorization header when logged out', async () => {
        await callRoute({ isLoggedIn: false });
        expect(authHeader()).toBeNull();
    });

    test('sends an Authorization header with bearer token when logged in', async () => {
        await callRoute({ isLoggedIn: true, token: { accessToken: 'my-token', refreshToken: 'my-refresh-token' } });
        expect(authHeader()).toBe('Bearer my-token');
    });

    test('forwards a bearer token sent by the caller', async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await callRoute({ isLoggedIn: false }, { Authorization: 'Bearer api-client-token' });
        expect(authHeader()).toBe('Bearer api-client-token');
    });

    test("prefers the caller's bearer token over the session token", async () => {
        await callRoute(
            { isLoggedIn: true, token: { accessToken: 'my-token', refreshToken: 'my-refresh-token' } },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            { Authorization: 'Bearer api-client-token' },
        );
        expect(authHeader()).toBe('Bearer api-client-token');
    });

    test('hands the S3 redirect to the browser rather than downloading the file itself', async () => {
        const response = await callRoute({ isLoggedIn: false });
        expect(response.status).toBe(307);
        expect(response.headers.get('Location')).toBe(s3Url);
        // Without 'manual' the file would be streamed through the website instead of from S3
        expect(backendRequest().redirect).toBe('manual');
    });

    test('allows any origin on the S3 redirect', async () => {
        const response = await callRoute({ isLoggedIn: false });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('allows any origin on non-redirect responses', async () => {
        fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
        const response = await callRoute({ isLoggedIn: false });
        expect(response.status).toBe(404);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
});
