/* eslint-disable @typescript-eslint/naming-convention -- HTTP header and environment variable names */
import axios, { AxiosHeaders } from 'axios';
import { describe, expect, test } from 'vitest';

import { getLapisAxios } from './browserLapisAxios.ts';
import {
    ByteLru,
    CACHE_STATUS_HEADER,
    type ConditionalCacheStore,
    createConditionalCacheAdapter,
    emptyStats,
    MemoryCacheStore,
    requestCacheKey,
    utf16StringCodec,
} from './conditionalCache.ts';
import { etagServer, fakeLapis } from './testServer.ts';

const lapisUrl = 'http://lapis.dummy/organism';

function setup(
    server: ReturnType<typeof fakeLapis>,
    store: ConditionalCacheStore = new MemoryCacheStore(1024 * 1024, utf16StringCodec),
) {
    const stats = emptyStats();
    const client = axios.create({
        baseURL: lapisUrl,
        adapter: createConditionalCacheAdapter({ store, stats, baseAdapter: server.adapter }),
    });
    return { client, stats, store };
}

describe('conditional LAPIS cache (browser)', () => {
    test('stores a 200 with an ETag and reuses the body on 304', async () => {
        const server = etagServer({ version: 1 });
        const { client, stats } = setup(server);

        const first = await client.post('/sample/details', { fields: ['a'], limit: 10 });
        const second = await client.post('/sample/details', { limit: 10, fields: ['a'] });

        expect(first.data).toEqual({ data: [{ version: 1 }] });
        expect(second.data).toEqual(first.data);
        expect(second.status).toBe(200);
        expect(second.headers[CACHE_STATUS_HEADER]).toBe('revalidated');
        expect(server.requests).toHaveLength(2);
        expect(server.requests[0].ifNoneMatch).toBeUndefined();
        expect(server.requests[1].ifNoneMatch).toMatch(/^W\/"1-/);
        expect(stats).toMatchObject({ miss: 1, stored: 1, notModified: 1 });
    });

    test('always revalidates: a changed version is fetched and replaces the entry', async () => {
        const state = { version: 1 };
        const server = etagServer(state);
        const { client, stats } = setup(server);

        await client.post('/sample/details', {});
        state.version = 2;
        const changed = await client.post('/sample/details', {});
        const again = await client.post('/sample/details', {});

        expect(changed.data).toEqual({ data: [{ version: 2 }] });
        expect(again.data).toEqual({ data: [{ version: 2 }] });
        expect(server.requests.map((r) => r.ifNoneMatch?.slice(0, 4))).toEqual([undefined, 'W/"1', 'W/"2']);
        expect(stats).toMatchObject({ miss: 1, changed: 1, notModified: 1, stored: 2 });
    });

    test('a 304 without a usable stored entry is retried without If-None-Match', async () => {
        let replies = 0;
        const server = fakeLapis((request) => {
            replies++;
            if (request.ifNoneMatch !== undefined) {
                return { status: 304, headers: { etag: 'W/"something-else"' } };
            }
            return { status: 200, headers: { etag: `W/"v${replies}"` }, body: `{"n":${replies}}` };
        });
        const { client, stats } = setup(server);

        await client.post('/sample/aggregated', {});
        const response = await client.post('/sample/aggregated', {});

        expect(response.data).toEqual({ n: 3 });
        expect(server.requests.map((r) => r.ifNoneMatch)).toEqual([undefined, 'W/"v1"', undefined]);
        expect(stats.retried).toBe(1);
    });

    test('a 304 whose stored body cannot be loaded is retried without If-None-Match', async () => {
        const server = etagServer({ version: 1 });
        const store: ConditionalCacheStore = {
            lookup: () => ({
                etag: `W/"1-${lapisUrl}/sample/details-{}"`,
                validatedAt: 0,
                load: () => Promise.resolve(undefined),
            }),
            put: () => true,
            confirm: () => {},
            delete: () => {},
        };
        const { client, stats } = setup(server, store);

        const response = await client.post('/sample/details', {});

        expect(response.data).toEqual({ data: [{ version: 1 }] });
        expect(server.requests.map((r) => r.ifNoneMatch !== undefined)).toEqual([true, false]);
        expect(stats.retried).toBe(1);
    });

    test('errors are not cached, and a failed revalidation is not answered from the cache', async () => {
        let status = 500;
        const server = fakeLapis(() =>
            status === 200
                ? { status: 200, headers: { etag: 'W/"ok"' }, body: '{"ok":true}' }
                : { status, headers: { 'etag': 'W/"error"', 'cache-control': 'no-store' }, body: '{"error":{}}' },
        );
        const { client, stats } = setup(server);

        await expect(client.post('/sample/details', {})).rejects.toMatchObject({ response: { status: 500 } });
        status = 200;
        await client.post('/sample/details', {});
        status = 503;
        await expect(client.post('/sample/details', {})).rejects.toMatchObject({ response: { status: 503 } });

        expect(server.requests.map((r) => r.ifNoneMatch)).toEqual([undefined, undefined, 'W/"ok"']);
        expect(stats.stored).toBe(1);
    });

    test('responses without an ETag or with no-store pass through and are not stored', async () => {
        const server = fakeLapis(() => ({
            status: 200,
            headers: { 'cache-control': 'no-cache, no-store, max-age=0, must-revalidate' },
            body: '{"lapis":true}',
        }));
        const { client, stats } = setup(server);

        await client.post('/sample/details', {});
        const second = await client.post('/sample/details', {});

        expect(second.data).toEqual({ lapis: true });
        expect(server.requests.every((r) => r.ifNoneMatch === undefined)).toBe(true);
        expect(stats).toMatchObject({ stored: 0, uncacheable: 2 });
    });

    test('a 200 without an ETag drops the stored entry', async () => {
        let withEtag = true;
        const server = fakeLapis((request) =>
            request.ifNoneMatch !== undefined && withEtag
                ? { status: 304, headers: { etag: request.ifNoneMatch } }
                : { status: 200, headers: withEtag ? { etag: 'W/"a"' } : {}, body: '{}' },
        );
        const { client } = setup(server);

        await client.post('/sample/details', {});
        withEtag = false;
        await client.post('/sample/details', {});
        await client.post('/sample/details', {});

        expect(server.requests.map((r) => r.ifNoneMatch)).toEqual([undefined, 'W/"a"', undefined]);
    });

    test('requests with an Authorization header bypass the cache', async () => {
        const server = etagServer({ version: 1 });
        const { client, stats } = setup(server);

        await client.post('/sample/details', {}, { headers: { Authorization: 'Bearer x' } });
        await client.post('/sample/details', {}, { headers: { Authorization: 'Bearer x' } });

        expect(server.requests.every((r) => r.ifNoneMatch === undefined)).toBe(true);
        expect(stats).toMatchObject({ bypassed: 2, stored: 0 });
    });

    test('methods outside `methods` pass through without If-None-Match and are not stored', async () => {
        const server = etagServer({ version: 1 });
        const stats = emptyStats();
        const store = new MemoryCacheStore(1024 * 1024, utf16StringCodec);
        const client = axios.create({
            baseURL: lapisUrl,
            adapter: createConditionalCacheAdapter({ store, stats, baseAdapter: server.adapter, methods: ['post'] }),
        });

        await client.get('/sample/details?limit=1');
        const second = await client.get('/sample/details?limit=1');
        await client.post('/sample/details', {});
        await client.post('/sample/details', {});

        expect(second.headers[CACHE_STATUS_HEADER]).toBeUndefined();
        expect(server.requests.map((r) => [r.method, r.ifNoneMatch !== undefined])).toEqual([
            ['get', false],
            ['get', false],
            ['post', false],
            ['post', true],
        ]);
        expect(stats).toMatchObject({ bypassed: 2, stored: 1, notModified: 1 });
    });

    test('keys by method, URL, normalised body and Accept', () => {
        const key = (config: object) =>
            requestCacheKey({ baseURL: lapisUrl, headers: new AxiosHeaders(), ...config } as never);
        const post = { method: 'post', url: '/sample/details' };

        expect(key({ ...post, data: '{"a":1,"b":[2,1]}' })).toEqual(key({ ...post, data: '{"b":[2,1],"a":1}' }));
        expect(key({ ...post, data: '{"b":[1,2]}' })).not.toEqual(key({ ...post, data: '{"b":[2,1]}' }));
        expect(key({ ...post, data: '{}' })).not.toEqual(key({ ...post, url: '/sample/aggregated', data: '{}' }));
        expect(key({ ...post, data: '{}' })).not.toEqual(key({ ...post, method: 'get', data: '{}' }));
        expect(
            key({ ...post, data: '{}', headers: new AxiosHeaders({ Accept: 'text/tab-separated-values' }) }),
        ).not.toEqual(key({ ...post, data: '{}' }));
        expect(key({ ...post, data: '{}', responseType: 'stream' })).toBeUndefined();
        expect(key({ ...post, method: 'put', data: '{}' })).toBeUndefined();
    });

    test('evicts least-recently-used entries by bytes', () => {
        const evicted: string[] = [];
        const lru = new ByteLru<string>(100, (key) => evicted.push(key));
        lru.set('a', 'a', 40);
        lru.set('b', 'b', 40);
        lru.get('a');
        lru.set('c', 'c', 40);

        expect(evicted).toEqual(['b']);
        expect(lru.bytes).toBe(80);
        expect(lru.set('huge', 'huge', 101)).toBe(false);
        expect(lru.size).toBe(2);
    });

    test('the memory store holds as many bodies as its byte budget allows', async () => {
        const body = 'x'.repeat(1000);
        const server = etagServer({ version: 1, bodyFor: () => JSON.stringify(body) });
        const store = new MemoryCacheStore(4 * 2600, utf16StringCodec, 4000);
        const { client } = setup(server, store);

        for (const limit of [1, 2, 3, 4, 5]) {
            await client.post('/sample/details', { limit });
        }

        expect(store.size).toBe(4);
        expect(store.bytes).toBeLessThanOrEqual(4 * 2600);
        expect(store.lookup(requestKeyFor({ limit: 1 }))).toBeUndefined();
        expect(store.lookup(requestKeyFor({ limit: 5 }))).toBeDefined();
    });

    test('getLapisAxios shares one cache across instances in the browser', () => {
        const url = 'http://lapis.dummy/shared';
        const first = getLapisAxios(url);
        expect(getLapisAxios(url)).toBe(first);
        expect(first.defaults.adapter).toBeTypeOf('function');
    });
});

function requestKeyFor(body: object) {
    return requestCacheKey({
        method: 'post',
        baseURL: lapisUrl,
        url: '/sample/details',
        data: JSON.stringify(body),
        headers: new AxiosHeaders({ Accept: 'application/json, text/plain, */*' }),
    } as never)!;
}
