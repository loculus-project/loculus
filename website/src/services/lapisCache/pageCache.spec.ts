/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import type { DataVersionSource, ObservedVersion } from './dataVersions.ts';
import {
    createCacheMaintenance,
    detectPageCodec,
    EDGE_CACHE_CONTROL,
    PAGE_CACHE_STATUS_HEADER,
    PageCache,
    PageCodec,
    type PageCacheOptions,
    type RenderedPage,
} from './pageCache.ts';
import { DiskBlobStore, TieredBlobStore } from './serverCacheStore.ts';

const KiB = 1024;
const MiB = 1024 * KiB;

class FakeVersions implements DataVersionSource {
    public readonly versions = new Map<string, ObservedVersion>();
    public set(organism: string, version: string, since: number) {
        this.versions.set(organism, { version, since });
    }
    public current(organism: string) {
        return this.versions.get(organism);
    }
    public snapshot() {
        return new Map(this.versions);
    }
}

let dir: string;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-cache-test-'));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

const pageHtml = (accession: string) =>
    `<!doctype html><html><head><title>${accession}</title></head><body>${'<div class="layout">shared markup</div>'.repeat(200)}<main>${accession} ${'x'.repeat(2000)}</main></body></html>`;

function setup(options: Partial<PageCacheOptions> = {}, store = new TieredBlobStore(MiB, undefined)) {
    const clock = { now: 1_000_000 };
    const versions = new FakeVersions();
    versions.set('mpox', '100', 0);
    const cache = new PageCache(store, versions, new PageCodec(), {
        maxAgeMs: 24 * 3600_000,
        admitAfterMs: 25_000,
        edgeCacheHeaders: false,
        now: () => clock.now,
        ...options,
    });
    let renders = 0;
    const render =
        (rendered: Partial<RenderedPage> & { html?: string } = {}) =>
        () => {
            renders++;
            return Promise.resolve({
                response: new Response(rendered.html ?? pageHtml('LOC_1.1'), {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                }),
                organism: 'mpox',
                setsCookies: false,
                ...rendered,
            });
        };
    const get = (url: string, headers: Record<string, string> = {}, rendered: Parameters<typeof render>[0] = {}) =>
        cache.handle({ method: 'GET', url: new URL(url), headers: new Headers(headers) }, render(rendered));
    return { cache, clock, versions, get, renders: () => renders, store };
}

describe('page cache', () => {
    test('stores an anonymous render and serves it without rendering', async () => {
        const { get, renders, cache } = setup();

        const miss = await get('https://site/seq/LOC_1.1');
        const hit = await get('https://site/seq/LOC_1.1');

        expect(miss.headers.get(PAGE_CACHE_STATUS_HEADER)).toBe('miss');
        expect(hit.headers.get(PAGE_CACHE_STATUS_HEADER)).toBe('hit');
        expect(hit.headers.get('content-type')).toBe('text/html');
        expect(await hit.text()).toBe(pageHtml('LOC_1.1'));
        expect(await miss.text()).toBe(pageHtml('LOC_1.1'));
        expect(renders()).toBe(1);
        expect(cache.stats).toMatchObject({ misses: 1, stored: 1, hits: 1 });
    });

    test('keys by path and sorted query parameters', async () => {
        const { get, renders } = setup();

        await get('https://site/seq/LOC_1.1?b=2&a=1');
        await get('https://other-host/seq/LOC_1.1?a=1&b=2');
        await get('https://site/seq/LOC_1.1');
        await get('https://site/seq/LOC_2.1');

        expect(renders()).toBe(3);
    });

    test("an entry is valid only while its organism's data version is unchanged", async () => {
        const { get, renders, versions, clock, cache } = setup();

        await get('https://site/seq/LOC_1.1');
        clock.now += 60_000;
        versions.set('mpox', '101', clock.now);
        const afterBump = await get('https://site/seq/LOC_1.1');
        expect(afterBump.headers.get(PAGE_CACHE_STATUS_HEADER)).toBe('miss');
        expect(cache.stats.stale).toBe(1);

        // renders right after the new version appeared are not stored
        await get('https://site/seq/LOC_1.1');
        clock.now += 25_000;
        await get('https://site/seq/LOC_1.1');
        const hit = await get('https://site/seq/LOC_1.1');

        expect(hit.headers.get(PAGE_CACHE_STATUS_HEADER)).toBe('hit');
        expect(renders()).toBe(4);
        expect(cache.stats).toMatchObject({ notAdmitted: 2, stored: 2 });
    });

    test('a render during which the version changed is not stored', async () => {
        const { cache, versions, clock } = setup();
        clock.now = 100_000;

        await cache.handle({ method: 'GET', url: new URL('https://site/seq/LOC_1.1'), headers: new Headers() }, () => {
            versions.set('mpox', '101', 50_000);
            return Promise.resolve({
                response: new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
                organism: 'mpox',
                setsCookies: false,
            });
        });

        expect(cache.stats).toMatchObject({ notAdmitted: 1, stored: 0 });
    });

    test('an unknown data version (poll failed or not yet done) caches nothing', async () => {
        const { get, versions, cache } = setup();
        versions.versions.clear();

        await get('https://site/seq/LOC_1.1');
        await get('https://site/seq/LOC_1.1');

        expect(cache.stats).toMatchObject({ notAdmitted: 2, stored: 0, hits: 0 });
    });

    test.each([
        ['an access token cookie', { cookie: 'theme=dark; access_token=abc' }],
        ['a refresh token cookie', { cookie: 'refresh_token=abc' }],
        ['an Authorization header', { authorization: 'Bearer abc' }],
    ])('requests with %s neither read nor fill the cache', async (_, headers) => {
        const { get, renders, cache } = setup();

        await get('https://site/seq/LOC_1.1');
        const authenticated = await get('https://site/seq/LOC_1.1', headers);
        await get('https://site/seq/LOC_2.1', headers);

        expect(authenticated.headers.get(PAGE_CACHE_STATUS_HEADER)).toBeNull();
        expect(renders()).toBe(3);
        expect(cache.stats).toMatchObject({ bypassed: 2, stored: 1 });
    });

    test('an unrelated cookie does not bypass the cache', async () => {
        const { get, renders } = setup();

        await get('https://site/seq/LOC_1.1', { cookie: 'theme=dark' });
        await get('https://site/seq/LOC_1.1', { cookie: 'plausible=1' });

        expect(renders()).toBe(1);
    });

    test('OpenID Connect callbacks and non-GET requests bypass the cache', async () => {
        const { get, cache } = setup();

        await get('https://site/seq/LOC_1.1?code=abc&state=xyz');
        await cache.handle({ method: 'POST', url: new URL('https://site/seq/LOC_1.1'), headers: new Headers() }, () =>
            Promise.resolve({ response: new Response(''), organism: 'mpox', setsCookies: false }),
        );

        expect(cache.stats).toMatchObject({ bypassed: 2, stored: 0 });
    });

    test('stores nothing that did not opt in, is not a 200 HTML page, or sets cookies', async () => {
        const { get, cache } = setup();

        await get('https://site/a', {}, { organism: undefined });
        await get('https://site/b', {}, { setsCookies: true });
        await get(
            'https://site/c',
            {},
            { response: new Response('nope', { status: 404, headers: { 'Content-Type': 'text/html' } }) },
        );
        await get(
            'https://site/d',
            {},
            { response: new Response('{}', { headers: { 'Content-Type': 'application/json' } }) },
        );
        // A Set-Cookie header on the response is refused too; happy-dom's Headers drop it, so it is not tested here.

        expect(cache.stats).toMatchObject({ stored: 0, uncacheable: 3 });
    });

    test('entries expire after the maximum age', async () => {
        const { get, clock, cache, renders } = setup({ maxAgeMs: 3600_000 });

        await get('https://site/seq/LOC_1.1');
        clock.now += 3600_001;
        await get('https://site/seq/LOC_1.1');

        expect(renders()).toBe(2);
        expect(cache.stats.expired).toBe(1);
    });

    test('stays within its memory and disk budgets', async () => {
        const store = new TieredBlobStore(16 * KiB, new DiskBlobStore(dir, 64 * KiB));
        const { get, cache } = setup({}, store);

        for (let page = 0; page < 60; page++) {
            await get(
                `https://site/seq/LOC_${page}.1`,
                {},
                { html: pageHtml(`LOC_${page}.1`) + 'y'.repeat(page * 97) },
            );
            await store.disk!.pendingWrites;
        }

        expect(store.memory.bytes).toBeLessThanOrEqual(16 * KiB);
        expect(store.disk!.bytes).toBeLessThanOrEqual(64 * KiB);
        expect(store.disk!.size).toBeGreaterThan(0);
        expect(cache.stats.stored).toBe(60);
        const hit = await get('https://site/seq/LOC_59.1');
        expect(await hit.text()).toBe(pageHtml('LOC_59.1') + 'y'.repeat(59 * 97));
    });

    test('edge cache headers are opt-in, public only for anonymous requests, and private otherwise', async () => {
        const { get } = setup({ edgeCacheHeaders: true });

        const miss = await get('https://site/seq/LOC_1.1');
        const hit = await get('https://site/seq/LOC_1.1');
        const authenticated = await get('https://site/seq/LOC_1.1', { cookie: 'access_token=abc' });

        expect(miss.headers.get('cache-control')).toBe(EDGE_CACHE_CONTROL);
        expect(hit.headers.get('cache-control')).toBe(EDGE_CACHE_CONTROL);
        expect(hit.headers.get('vary')).toBe('Cookie');
        expect(authenticated.headers.get('cache-control')).toBe('private, no-store');

        const { get: getWithoutFlag } = setup();
        expect((await getWithoutFlag('https://site/seq/LOC_1.1')).headers.get('cache-control')).toBeNull();
    });

    test("purges an organism's pages of the old version after the grace period, and expired pages", async () => {
        const { get, versions, clock, store } = setup();
        const tasks: (() => void)[] = [];
        const maintenance = createCacheMaintenance({
            stores: [store],
            versions,
            graceMs: 120_000,
            maxAgeMs: 3600_000,
            now: () => clock.now,
            schedule: (task) => tasks.push(task),
        });
        versions.set('ebola', '7', 0);

        await get('https://site/seq/LOC_1.1');
        await get('https://site/seq/LOC_E.1', {}, { organism: 'ebola' });
        versions.set('mpox', '101', clock.now);
        maintenance.onVersionChange('mpox');
        expect(store.memory.size).toBe(2);
        tasks[0]();
        expect([...store.memory.entries()].map(([key]) => key)).toEqual(['/seq/LOC_E.1?']);

        clock.now += 3600_001;
        expect(maintenance.sweepExpired()).toBe(1);
        expect(store.memory.size).toBe(0);
    });
});

describe('page codec', () => {
    test('this Node honours zstd dictionaries', () => {
        expect(detectPageCodec()).toBe('zstd-dict');
    });

    test.each(['zstd-dict', 'zstd', 'gzip'] as const)('%s round-trips', (kind) => {
        const codec = new PageCodec(kind);
        const first = Buffer.from(pageHtml('LOC_1.1'));
        const second = Buffer.from(pageHtml('LOC_2.1'));

        const encodedFirst = codec.encode('mpox', first);
        const encodedSecond = codec.encode('mpox', second);

        expect(codec.decode(encodedFirst.codec, encodedFirst.body)).toEqual(first);
        expect(codec.decode(encodedSecond.codec, encodedSecond.body)).toEqual(second);
    });

    test('a dictionary from an earlier page of the organism shrinks later pages', () => {
        const withDictionary = new PageCodec('zstd-dict');
        const plain = new PageCodec('zstd');
        withDictionary.encode('mpox', Buffer.from(pageHtml('LOC_1.1')));

        const small = withDictionary.encode('mpox', Buffer.from(pageHtml('LOC_2.1'))).body.length;
        const large = plain.encode('mpox', Buffer.from(pageHtml('LOC_2.1'))).body.length;

        expect(small).toBeLessThan(large / 2);
    });

    test('an unknown dictionary is a decode error', () => {
        expect(() => new PageCodec('zstd-dict').decode('zstd-dict:mpox#gone', Buffer.from('x'))).toThrow();
    });
});
