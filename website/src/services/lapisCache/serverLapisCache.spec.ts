/* eslint-disable @typescript-eslint/naming-convention -- HTTP header and environment variable names */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import axios from 'axios';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { CACHE_STATUS_HEADER } from './conditionalCache.ts';
import {
    createServerLapisCache,
    DiskCacheStore,
    serverLapisCacheConfigFromEnv,
    type ServerLapisCacheConfig,
} from './serverLapisCache.ts';
import { etagServer } from './testServer.ts';
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

function setup(config: Partial<ServerLapisCacheConfig>, bodyBytes = 10 * KiB) {
    const clock = { now: 1_000_000 };
    const state = { version: 1, bodyFor: () => JSON.stringify({ data: 'x'.repeat(bodyBytes) }) };
    const server = etagServer(state);
    const cache = createServerLapisCache(
        { memoryBytes: MiB, diskBytes: 0, dir: undefined, freshMs: 0, ...config },
        { now: () => clock.now, baseAdapter: server.adapter },
    );
    const client = axios.create({ baseURL: lapisUrl, adapter: cache.adapter });
    return { client, cache, server, clock, state };
}

const entryFiles = () => fs.readdirSync(path.join(dir, 'entries'));

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
        await cache.store.disk!.pendingWrites;
    };

    test('spills entries evicted from memory to disk and serves them after a 304', async () => {
        const { client, cache, server } = setup({ memoryBytes: 90 * KiB, diskBytes: MiB, dir });

        await fill(client, cache, 10);

        expect(cache.store.memory.size).toBe(8);
        expect(cache.store.disk!.size).toBe(2);
        expect(entryFiles()).toHaveLength(2);

        const fromDisk = await client.post('/sample/details', { page: 0 });

        expect(fromDisk.data).toEqual({ data: 'x'.repeat(10 * KiB) });
        expect(fromDisk.headers[CACHE_STATUS_HEADER]).toBe('revalidated');
        expect(server.requests.at(-1)!.ifNoneMatch).toMatch(/^W\/"1-/);
        expect(cache.tierStats).toMatchObject({ diskHits: 1, promotions: 1 });
        expect(cache.stats.notModified).toBe(1);
        expect(cache.store.memory.size).toBe(8);
        await cache.store.disk!.pendingWrites;
        expect(cache.store.disk!.size).toBe(2);
    });

    test('keeps memory and disk within their byte budgets', async () => {
        const { client, cache } = setup({ memoryBytes: 90 * KiB, diskBytes: 200 * KiB, dir });

        await fill(client, cache, 30);

        expect(cache.store.memory.bytes).toBeLessThanOrEqual(90 * KiB);
        expect(cache.store.disk!.bytes).toBeLessThanOrEqual(200 * KiB);
        expect(cache.store.memory.size).toBe(8);
        expect(cache.store.disk!.size).toBe(16);
        // evicted files are removed asynchronously
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(entryFiles()).toHaveLength(16);
    });

    test('bodies too large for memory go straight to disk', async () => {
        const { client, cache } = setup({ memoryBytes: 64 * KiB, diskBytes: MiB, dir }, 20 * KiB);

        await client.post('/sample/details', {});
        await cache.store.disk!.pendingWrites;

        expect(cache.store.memory.size).toBe(0);
        expect(cache.store.disk!.size).toBe(1);
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
        const full = path.join(dir, 'entries', file);
        fs.writeFileSync(full, fs.readFileSync(full).subarray(0, 500));

        const response = await client.post('/sample/details', { page: 0 });

        expect(response.data).toEqual({ data: 'x'.repeat(10 * KiB) });
        expect(server.requests.slice(-2).map((r) => r.ifNoneMatch !== undefined)).toEqual([true, false]);
        expect(cache.tierStats.diskErrors).toBe(1);
        expect(cache.stats.retried).toBe(1);
    });

    test('a corrupt disk entry within the freshness window is fetched again', async () => {
        const { client, cache, server } = setup({ memoryBytes: 90 * KiB, diskBytes: MiB, dir, freshMs: 60_000 });

        await fill(client, cache, 9);
        fs.writeFileSync(path.join(dir, 'entries', entryFiles()[0]), 'garbage');

        const response = await client.post('/sample/details', { page: 0 });

        expect(response.data).toEqual({ data: 'x'.repeat(10 * KiB) });
        expect(server.requests.at(-1)!.ifNoneMatch).toBeUndefined();
        expect(cache.tierStats.diskErrors).toBe(1);
    });

    test('a missing disk file is a miss', async () => {
        const store = new DiskCacheStore(dir, MiB);
        store.put('key', 'W/"a"', { body: 'body', contentType: 'text/plain' }, 0);
        await store.pendingWrites;
        fs.rmSync(path.join(dir, 'entries', entryFiles()[0]));

        expect(await store.lookup('key')!.load()).toBeUndefined();
        expect(store.lookup('key')).toBeUndefined();
    });

    test('discards what is on disk at startup', async () => {
        const first = new DiskCacheStore(dir, MiB);
        first.put('key', 'W/"a"', { body: 'body', contentType: undefined }, 0);
        await first.pendingWrites;
        expect(entryFiles()).toHaveLength(1);

        const second = new DiskCacheStore(dir, MiB);

        expect(entryFiles()).toHaveLength(0);
        expect(second.lookup('key')).toBeUndefined();
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
        expect(serverLapisCacheConfigFromEnv({})).toBeUndefined();
        expect(serverLapisCacheConfigFromEnv({ LAPIS_CACHE_MEMORY_MB: '0' })).toBeUndefined();
        expect(serverLapisCacheConfigFromEnv({ LAPIS_CACHE_MEMORY_MB: '300', LAPIS_CACHE_DISK_MB: '3000' })).toEqual({
            memoryBytes: 300 * MiB,
            diskBytes: 0,
            dir: undefined,
            freshMs: 0,
        });
        expect(
            serverLapisCacheConfigFromEnv({
                LAPIS_CACHE_MEMORY_MB: '300',
                LAPIS_CACHE_DISK_MB: '3000',
                LAPIS_CACHE_DIR: '/cache/lapis',
                LAPIS_CACHE_FRESH_SECONDS: '15',
            }),
        ).toEqual({ memoryBytes: 300 * MiB, diskBytes: 3000 * MiB, dir: '/cache/lapis', freshMs: 15_000 });
        expect(serverLapisCacheConfigFromEnv({ LAPIS_CACHE_MEMORY_MB: 'lots' })).toBeUndefined();
    });
});
