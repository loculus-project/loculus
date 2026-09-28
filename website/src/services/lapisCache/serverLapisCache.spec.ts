/* eslint-disable @typescript-eslint/naming-convention -- HTTP header and environment variable names */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import axios, { AxiosHeaders } from 'axios';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CACHE_STATUS_HEADER, requestCacheKey } from './conditionalCache.ts';
import { DataVersionTracker } from './dataVersions.ts';
import { createCacheMaintenance } from './pageCache.ts';
import { DiskBlobStore } from './serverCacheStore.ts';
import { createServerLapisCache, organismOfUrl, type ServerLapisCacheConfig } from './serverLapisCache.ts';
import { etagServer } from './testServer.ts';
import { websiteCacheConfigFromEnv } from './websiteCache.ts';
import { testServer } from '../../../vitest.setup.ts';

const KiB = 1024;
const MiB = 1024 * KiB;
const lapisUrl = 'http://lapis.dummy/organism';

let dir: string;

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lapis-cache-test-'));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

function setup(
    config: Partial<ServerLapisCacheConfig>,
    bodyBytes = 10 * KiB,
    options: Parameters<typeof createServerLapisCache>[1] = {},
) {
    const clock = { now: 1_000_000 };
    const state = { version: 1, bodyFor: () => JSON.stringify({ data: 'x'.repeat(bodyBytes) }) };
    const server = etagServer(state);
    const cache = createServerLapisCache(
        { memoryBytes: MiB, diskBytes: 0, dir: undefined, freshMs: 0, ...config },
        { now: () => clock.now, baseAdapter: server.adapter, ...options },
    );
    const client = axios.create({ baseURL: lapisUrl, adapter: cache.adapter });
    return { client, cache, server, clock, state };
}

const entryFiles = () =>
    fs
        .readdirSync(path.join(dir, 'entries'), { recursive: true, encoding: 'utf8' })
        .filter((name) => path.basename(name).length === 64)
        .map((name) => path.join(dir, 'entries', name));

describe('SSR LAPIS cache', () => {
    // 10 KiB bodies: memory tiers of 90 KiB hold 8 (an entry may take at most 1/8 of a tier), disk files use 12 KiB
    const fill = async (
        client: ReturnType<typeof setup>['client'],
        cache: ReturnType<typeof setup>['cache'],
        pages: number,
    ) => {
        for (let page = 0; page < pages; page++) {
            await client.post('/sample/details', { page });
        }
        await cache.blobs.disk!.pendingWrites;
    };

    test('spills entries evicted from memory to disk and serves them after a 304', async () => {
        const { client, cache, server } = setup({ memoryBytes: 90 * KiB, diskBytes: MiB, dir });

        await fill(client, cache, 10);

        expect(cache.blobs.memory.size).toBe(8);
        expect(cache.blobs.disk!.size).toBe(2);
        expect(entryFiles()).toHaveLength(2);

        const fromDisk = await client.post('/sample/details', { page: 0 });

        expect(fromDisk.data).toEqual({ data: 'x'.repeat(10 * KiB) });
        expect(fromDisk.headers[CACHE_STATUS_HEADER]).toBe('revalidated');
        expect(server.requests.at(-1)!.ifNoneMatch).toMatch(/^W\/"1-/);
        expect(cache.storeStats).toMatchObject({ diskHits: 1, promotions: 1 });
        expect(cache.stats.notModified).toBe(1);
        expect(cache.blobs.memory.size).toBe(8);
        await cache.blobs.disk!.pendingWrites;
        expect(cache.blobs.disk!.size).toBe(2);
    });

    test('keeps memory and disk within their byte budgets', async () => {
        const { client, cache } = setup({ memoryBytes: 90 * KiB, diskBytes: 200 * KiB, dir });

        await fill(client, cache, 30);

        expect(cache.blobs.memory.bytes).toBeLessThanOrEqual(90 * KiB);
        expect(cache.blobs.disk!.bytes).toBeLessThanOrEqual(200 * KiB);
        expect(cache.blobs.memory.size).toBe(8);
        expect(cache.blobs.disk!.size).toBe(16);
        // evicted files are removed asynchronously
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(entryFiles()).toHaveLength(16);
    });

    test('bodies too large for memory go straight to disk', async () => {
        const { client, cache } = setup({ memoryBytes: 64 * KiB, diskBytes: MiB, dir }, 20 * KiB);

        await client.post('/sample/details', {});
        await cache.blobs.disk!.pendingWrites;

        expect(cache.blobs.memory.size).toBe(0);
        expect(cache.blobs.disk!.size).toBe(1);
    });

    test('serves without revalidating within the freshness window only', async () => {
        const { client, cache, server, clock, state } = setup({ freshMs: 15_000 });

        await client.post('/sample/aggregated', {});
        clock.now += 14_000;
        const fresh = await client.post('/sample/aggregated', {});
        expect(fresh.headers[CACHE_STATUS_HEADER]).toBe('fresh');
        expect(server.requests).toHaveLength(1);

        clock.now += 2_000;
        await client.post('/sample/aggregated', {});
        expect(server.requests).toHaveLength(2);
        expect(server.requests[1].ifNoneMatch).toBeDefined();

        // the 304 restarted the window
        clock.now += 10_000;
        await client.post('/sample/aggregated', {});
        expect(server.requests).toHaveLength(2);

        state.version = 2;
        clock.now += 16_000;
        const changed = await client.post('/sample/aggregated', {});
        expect(changed.headers[CACHE_STATUS_HEADER]).toBeUndefined();
        expect(cache.stats).toMatchObject({ miss: 1, fresh: 2, notModified: 1, changed: 1 });
    });

    test('a corrupt disk entry is discarded and treated as a miss', async () => {
        const { client, cache, server } = setup({ memoryBytes: 90 * KiB, diskBytes: MiB, dir });

        await fill(client, cache, 9);
        const [file] = entryFiles();
        fs.writeFileSync(file, fs.readFileSync(file).subarray(0, 500));

        const response = await client.post('/sample/details', { page: 0 });

        expect(response.data).toEqual({ data: 'x'.repeat(10 * KiB) });
        expect(server.requests.slice(-2).map((r) => r.ifNoneMatch !== undefined)).toEqual([true, false]);
        expect(cache.storeStats.diskErrors).toBe(1);
        expect(cache.stats.retried).toBe(1);
    });

    test('a corrupt disk entry within the freshness window is fetched again', async () => {
        const { client, cache, server } = setup({ memoryBytes: 90 * KiB, diskBytes: MiB, dir, freshMs: 60_000 });

        await fill(client, cache, 9);
        fs.writeFileSync(entryFiles()[0], 'garbage');

        const response = await client.post('/sample/details', { page: 0 });

        expect(response.data).toEqual({ data: 'x'.repeat(10 * KiB) });
        expect(server.requests.at(-1)!.ifNoneMatch).toBeUndefined();
        expect(cache.storeStats.diskErrors).toBe(1);
    });

    test('a missing disk file is a miss', async () => {
        const store = new DiskBlobStore(dir, MiB);
        store.put('key', { tag: 'W/"a"', storedAt: 0, validatedAt: 0 }, Buffer.from('body'));
        await store.pendingWrites;
        fs.rmSync(entryFiles()[0]);

        expect(await store.lookup('key')!.load()).toBeUndefined();
        expect(store.lookup('key')).toBeUndefined();
    });

    test('moves what is on disk at startup aside and deletes it in the background', async () => {
        const first = new DiskBlobStore(dir, MiB);
        first.put('key', { tag: 'W/"a"', storedAt: 0, validatedAt: 0 }, Buffer.from('body'));
        await first.pendingWrites;
        expect(entryFiles()).toHaveLength(1);

        const second = new DiskBlobStore(dir, MiB);

        expect(entryFiles()).toHaveLength(0);
        expect(second.lookup('key')).toBeUndefined();
        await vi.waitFor(() => expect(fs.readdirSync(dir)).toEqual(['entries']));
    });

    test('drops expired entries at lookup', async () => {
        const { client, clock, server, cache } = setup({}, 100, { maxAgeMs: 60_000 });

        await client.post('/sample/details', {});
        clock.now += 61_000;
        await client.post('/sample/details', {});

        expect(server.requests.map((r) => r.ifNoneMatch)).toEqual([undefined, undefined]);
        expect(cache.storeStats.expired).toBe(1);
    });

    test("purges an organism's responses of an old data version after the grace period", async () => {
        const clock = { now: 1_000_000 };
        const dataVersion = { mpox: '1', ebola: '1' };
        const versions = new DataVersionTracker(['mpox', 'ebola'], (organism) =>
            Promise.resolve(dataVersion[organism as 'mpox' | 'ebola']),
        );
        await versions.poll();
        const server = etagServer({ version: 1 });
        const cache = createServerLapisCache(
            { memoryBytes: MiB, diskBytes: MiB, dir, freshMs: 0 },
            {
                now: () => clock.now,
                baseAdapter: server.adapter,
                versions,
                organismOf: organismOfUrl({ mpox: 'http://lapis/mpox', ebola: 'http://lapis/ebola' }),
            },
        );
        const tasks: { run: () => void; delayMs: number }[] = [];
        const maintenance = createCacheMaintenance({
            stores: [cache.blobs],
            versions,
            graceMs: 120_000,
            maxAgeMs: 86_400_000,
            now: () => clock.now,
            schedule: (run, delayMs) => tasks.push({ run, delayMs }),
        });
        const post = (url: string) => axios.post(url, {}, { adapter: cache.adapter });

        await post('http://lapis/mpox/sample/details');
        await post('http://lapis/mpox/sample/aggregated');
        await post('http://lapis/ebola/sample/details');
        dataVersion.mpox = '2';
        await versions.poll();
        maintenance.onVersionChange('mpox');
        // revalidated under the new version: kept
        await post('http://lapis/mpox/sample/aggregated');

        expect(tasks.map((task) => task.delayMs)).toEqual([120_000]);
        expect(cache.blobs.memory.size).toBe(3);
        tasks[0].run();

        expect(cache.blobs.memory.size).toBe(2);
        expect(cache.store.lookup(requestKey('http://lapis/mpox/sample/details'))).toBeUndefined();
        expect(cache.store.lookup(requestKey('http://lapis/mpox/sample/aggregated'))).toBeDefined();
        expect(cache.store.lookup(requestKey('http://lapis/ebola/sample/details'))).toBeDefined();
    });

    test('attributes URLs to organisms by their LAPIS base URL', () => {
        const organismOf = organismOfUrl({ ebola: 'http://lapis/ebola', ebolaSudan: 'http://lapis/ebola-sudan/' });
        expect(organismOf('http://lapis/ebola-sudan/sample/details')).toBe('ebolaSudan');
        expect(organismOf('http://lapis/ebola/sample/details')).toBe('ebola');
        expect(organismOf('http://lapis/other/sample/details')).toBeUndefined();
    });

    test('works through the real Node http adapter with gzip and an empty 304', async () => {
        const seen: (string | null)[] = [];
        testServer.use(
            http.post(`${lapisUrl}/sample/details`, async ({ request }) => {
                const body = await request.text();
                const ifNoneMatch = request.headers.get('If-None-Match');
                seen.push(ifNoneMatch);
                const etag = `W/"7-${body}"`;
                if (ifNoneMatch === etag) {
                    return new HttpResponse(null, {
                        status: 304,
                        headers: { 'ETag': etag, 'Cache-Control': 'no-cache' },
                    });
                }
                return new HttpResponse(gzipSync(JSON.stringify({ data: [{ answer: 42 }], info: {} })), {
                    status: 200,
                    headers: {
                        'ETag': etag,
                        'Cache-Control': 'no-cache',
                        'Content-Type': 'application/json',
                        'Content-Encoding': 'gzip',
                    },
                });
            }),
        );
        const cache = createServerLapisCache(
            { memoryBytes: MiB, diskBytes: 0, dir: undefined, freshMs: 0 },
            { baseAdapter: axios.getAdapter('http') },
        );
        const client = axios.create({ baseURL: lapisUrl, adapter: cache.adapter });

        const first = await client.post('/sample/details', { limit: 1 });
        const second = await client.post('/sample/details', { limit: 1 });

        expect(first.data).toEqual({ data: [{ answer: 42 }], info: {} });
        expect(second.data).toEqual(first.data);
        expect(seen).toEqual([null, 'W/"7-{"limit":1}"']);
        expect(cache.stats).toMatchObject({ miss: 1, stored: 1, notModified: 1 });
    });

    test('reads its configuration from the environment', () => {
        expect(websiteCacheConfigFromEnv({})).toEqual({
            lapis: undefined,
            pages: undefined,
            pollMs: 60_000,
            graceMs: 120_000,
            maxAgeMs: 24 * 3600_000,
        });
        expect(websiteCacheConfigFromEnv({ LAPIS_CACHE_MEMORY_MB: '0', PAGE_CACHE_MEMORY_MB: 'lots' })).toMatchObject({
            lapis: undefined,
            pages: undefined,
        });
        expect(websiteCacheConfigFromEnv({ LAPIS_CACHE_MEMORY_MB: '48', LAPIS_CACHE_DISK_MB: '512' }).lapis).toEqual({
            memoryBytes: 48 * MiB,
            diskBytes: 0,
            dir: undefined,
            freshMs: 0,
        });
        expect(
            websiteCacheConfigFromEnv({
                LAPIS_CACHE_MEMORY_MB: '48',
                LAPIS_CACHE_DISK_MB: '512',
                LAPIS_CACHE_FRESH_SECONDS: '15',
                PAGE_CACHE_MEMORY_MB: '16',
                PAGE_CACHE_DISK_MB: '2500',
                PAGE_CACHE_EDGE_HEADERS: 'true',
                WEBSITE_CACHE_DIR: '/cache',
                WEBSITE_CACHE_VERSION_POLL_SECONDS: '30',
                WEBSITE_CACHE_OLD_VERSION_GRACE_SECONDS: '60',
                WEBSITE_CACHE_MAX_AGE_HOURS: '12',
            }),
        ).toEqual({
            lapis: { memoryBytes: 48 * MiB, diskBytes: 512 * MiB, dir: '/cache/lapis', freshMs: 15_000 },
            pages: { memoryBytes: 16 * MiB, diskBytes: 2500 * MiB, dir: '/cache/pages', edgeCacheHeaders: true },
            pollMs: 30_000,
            graceMs: 60_000,
            maxAgeMs: 12 * 3600_000,
        });
    });
});

function requestKey(url: string) {
    return requestCacheKey({
        method: 'post',
        url,
        data: '{}',
        headers: new AxiosHeaders({ Accept: 'application/json, text/plain, */*' }),
    } as never)!;
}
