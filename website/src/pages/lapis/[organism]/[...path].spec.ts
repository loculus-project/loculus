/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names follow the protocol. */
import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ALL } from './[...path]';
import { getInstanceAccess } from '../../../utils/instanceAccess';

vi.mock('../../../config', () => ({
    loginIsRequired: () => true,
    getConfiguredOrganisms: () => [{ key: 'ebola-sudan' }],
    getRuntimeConfig: () => ({ serverSide: {} }),
    getLapisUrl: () => 'http://internal-lapis:8080',
}));
vi.mock('../../../utils/instanceAccess', () => ({ getInstanceAccess: vi.fn() }));

function context(path = 'sample/details', token?: string): APIContext {
    return {
        params: { organism: 'ebola-sudan', path },
        url: new URL(`https://loculus.test/lapis/ebola-sudan/${path}?country=Switzerland`),
        request: new Request('https://loculus.test/lapis/ebola-sudan/sample/details', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        locals: {},
    } as unknown as APIContext;
}

beforeEach(() => {
    vi.mocked(getInstanceAccess).mockResolvedValue({
        canReadReleasedData: true,
        canContribute: false,
        canManageMembership: false,
    });
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe('authorized LAPIS query proxy', () => {
    test('rejects anonymous requests without contacting LAPIS', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        expect((await ALL(context())).status).toBe(401);
        expect(fetch).not.toHaveBeenCalled();
    });
    test('rejects invalid explicit token even if cookie token exists', async () => {
        vi.mocked(getInstanceAccess).mockResolvedValue(undefined);
        const ctx = context('sample/details', 'bad');
        ctx.locals.session = { isLoggedIn: true, token: { accessToken: 'good', refreshToken: 'refresh' } };
        expect((await ALL(ctx)).status).toBe(401);
        expect(getInstanceAccess).toHaveBeenCalledWith('bad');
    });
    test('streams results without forwarding credentials and disables shared caching', async () => {
        const fetch = vi.fn().mockResolvedValue(
            new Response('data', {
                headers: { 'content-type': 'text/plain', 'content-length': '999', 'set-cookie': 'bad=1' },
            }),
        );
        vi.stubGlobal('fetch', fetch);
        const response = await ALL(context('sample/details', 'token'));
        expect(await response.text()).toBe('data');
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.has('set-cookie')).toBe(false);
        expect(response.headers.has('content-length')).toBe(false);
        expect((fetch.mock.calls[0][1].headers as Headers).has('Authorization')).toBe(false);
        expect(fetch.mock.calls[0][0].href).toBe('http://internal-lapis:8080/sample/details?country=Switzerland');
    });
    test.each(['../secret', '//attacker.test/', '%2e%2e/secret', 'sample\\secret'])(
        'rejects unsafe upstream path %s',
        async (path) => {
            expect((await ALL(context(path, 'token'))).status).toBe(400);
        },
    );
    test('does not forward upstream redirects', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://elsewhere/' } })),
        );
        expect((await ALL(context('sample/details', 'token'))).status).toBe(502);
    });
});
