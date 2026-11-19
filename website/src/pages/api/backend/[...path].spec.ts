import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ALL } from './[...path]';

vi.mock('../../../config', () => ({
    getRuntimeConfig: () => ({ serverSide: { backendUrl: 'http://backend:8079' } }),
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
        new Response('{"ok":true}', {
            status: 200,
            headers: new Headers([
                ['Content-Type', 'application/json'],
                ['Set-Cookie', 'backend=cookie'],
            ]),
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const loggedIn: Session = { isLoggedIn: true, token: { accessToken: 'my-token', refreshToken: 'my-refresh-token' } };

type CallOptions = { method?: string; headers?: [string, string][]; body?: string; session?: Session };

function callRoute(url: string, { method = 'GET', headers = [], body, session = loggedIn }: CallOptions = {}) {
    // Not a real `Request`: happy-dom's `Request` drops headers that browsers forbid scripts to set,
    // like `Origin` and `Sec-Fetch-Site`, but a server receives them.
    const request = { method, headers: new Headers(headers), body, signal: new AbortController().signal };
    return ALL({ request, url: new URL(url), locals: { session } } as unknown as APIContext) as Promise<Response>;
}

const backendCall = () => {
    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0];
    return { target: target as string, init: init!, headers: new Headers(init!.headers) };
};

describe('backend proxy route', () => {
    test('forwards path and query to the backend and adds the access token from the session', async () => {
        const response = await callRoute('http://website/api/backend/my-organism/get-sequences?page=0&size=10');

        const { target, headers } = backendCall();
        expect(target).toBe('http://backend:8079/my-organism/get-sequences?page=0&size=10');
        expect(headers.get('Authorization')).toBe('Bearer my-token');
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('{"ok":true}');
    });

    test('keeps path parameters URL-encoded', async () => {
        await callRoute('http://website/api/backend/groups/1/users/some%2Fuser');

        expect(backendCall().target).toBe('http://backend:8079/groups/1/users/some%2Fuser');
    });

    test('does not send an Authorization header when logged out', async () => {
        await callRoute('http://website/api/backend/user/groups', { session: { isLoggedIn: false } });

        expect(backendCall().headers.get('Authorization')).toBeNull();
    });

    test('forwards the request body and content type', async () => {
        await callRoute('http://website/api/backend/groups', {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json'],
                ['Sec-Fetch-Site', 'same-origin'],
            ],
            body: '{"groupName":"x"}',
        });

        const { init, headers } = backendCall();
        expect(init.method).toBe('POST');
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(init.body).toBe('{"groupName":"x"}');
    });

    test('does not forward cookies to the backend or back to the browser', async () => {
        const response = await callRoute('http://website/api/backend/user/groups', {
            headers: [['Cookie', 'access_token=my-token']],
        });

        expect(backendCall().headers.get('Cookie')).toBeNull();
        expect(response.headers.get('Set-Cookie')).toBeNull();
    });

    test('rejects state-changing cross-site requests', async () => {
        const response = await callRoute('http://website/api/backend/groups', {
            method: 'POST',
            headers: [['Sec-Fetch-Site', 'cross-site']],
            body: '{}',
        });

        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('rejects state-changing requests from another origin when Sec-Fetch-Site is missing', async () => {
        const response = await callRoute('http://website/api/backend/groups', {
            method: 'DELETE',
            headers: [
                ['Origin', 'https://evil.example'],
                ['Host', 'website'],
            ],
        });

        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('returns 502 when the backend is not reachable', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        const response = await callRoute('http://website/api/backend/user/groups');

        expect(response.status).toBe(502);
    });
});
