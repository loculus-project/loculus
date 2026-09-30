/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names follow the protocol. */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { getInstanceAccess, isContributionPage } from './instanceAccess';
vi.mock('../config', () => ({ getRuntimeConfig: () => ({ serverSide: { backendUrl: 'https://backend.test' } }) }));

afterEach(() => vi.unstubAllGlobals());

describe('instance access adapter', () => {
    test('delegates policy to backend using bearer token', async () => {
        const access = { canReadReleasedData: true, canContribute: false, canManageMembership: false };
        const fetch = vi.fn().mockResolvedValue(Response.json(access));
        vi.stubGlobal('fetch', fetch);
        expect(await getInstanceAccess('token')).toEqual(access);
        expect(fetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer token' });
    });
    test('fails closed when backend is unavailable or response is malformed', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ canContribute: true })));
        expect(await getInstanceAccess('token')).toBeUndefined();
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        expect(await getInstanceAccess('token')).toBeUndefined();
    });
    test.each([
        '/ebola-sudan/submission',
        '/ebola-sudan/submission/review',
        '/ebola-sudan/my_sequences',
        '/group/1/edit',
    ])('recognizes contribution page %s', (path) => expect(isContributionPage(path)).toBe(true));
    test('reading released sequences is not a contribution', () => {
        expect(isContributionPage('/ebola-sudan/search')).toBe(false);
    });
});
