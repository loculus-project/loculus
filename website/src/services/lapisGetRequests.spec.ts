/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names */
import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';

import { createConditionalCacheAdapter, MemoryCacheStore, utf16StringCodec } from './lapisCache/conditionalCache.ts';
import { fakeLapis } from './lapisCache/testServer.ts';
import { LapisClient } from './lapisClient.ts';
import {
    LAPIS_GET_MAX_URL_LENGTH,
    lapisRequestToQueryString,
    sendShortLapisRequestsAsGet,
    toGetIfShort,
} from './lapisGetRequests.ts';
import { testServer } from '../../vitest.setup.ts';
import type { Schema } from '../types/config.ts';

const COMMA_SPLIT = new Set(['fields', 'orderby', 'nucleotidemutations', 'aminoacidmutations']);

/** What the engine's parser receives from a GET: every value a string, list parameters comma-split and trimmed. */
function asEngineSeesGet(query: string): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [key, value] of new URLSearchParams(query)) {
        const values = COMMA_SPLIT.has(key.toLowerCase()) ? value.split(',').map((v) => v.trim()) : [value];
        (out[key] ??= []).push(...values.filter((v) => !COMMA_SPLIT.has(key.toLowerCase()) || v !== ''));
    }
    return out;
}

/** What it receives from the JSON body, stringified the way it compares values (ascending orderBy objects = names). */
function asEngineSeesJson(body: Record<string, unknown>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(body)) {
        if (value === undefined) continue;
        out[key] = (Array.isArray(value) ? value : [value]).map((v: unknown) =>
            typeof v === 'object' && v !== null ? (v as { field: string }).field : String(v as number),
        );
    }
    return out;
}

const config = (data: unknown, extra: Partial<InternalAxiosRequestConfig> = {}): InternalAxiosRequestConfig => ({
    method: 'post',
    baseURL: 'http://lapis.dummy/mpox',
    url: '/sample/details',
    data,
    headers: new AxiosHeaders({ 'Content-Type': 'application/json' }),
    ...extra,
});

describe('lapisRequestToQueryString', () => {
    const roundTrips: Record<string, unknown>[] = [
        {},
        { accessionVersion: 'LOC_000N3XR.1' },
        { accessionVersion: 'LOC_000N3XR.1', dataFormat: 'TSV' },
        {
            accession: 'LOC_1',
            fields: ['accessionVersion', 'version'],
            orderBy: [{ field: 'version', type: 'ascending' }],
        },
        {
            fields: ['accessionVersion', 'clade'],
            versionStatus: 'LATEST_VERSION',
            isRevocation: false,
            geoLocCountry: ['Democratic Republic of the Congo', 'USA'],
            orderBy: [{ field: 'clade' }],
            limit: 100,
            offset: 200,
        },
        { 'authors': 'Rimoin, A. W.; Kisalu, N.', 'authors.regex': 'a&b=c?d#e/f+g%h' },
        { advancedQuery: "(clade='I' OR geoLocCountry='USA') AND length>=1000" },
        { nucleotideMutations: ['C3000T', 'G5000A'], completenessFrom: 0.5, lengthTo: 1000 },
        { orderBy: ['random(42)'], geoLocCountry: 'Côte d’Ivoire', skipped: undefined },
    ];

    test.each(roundTrips)('GET means the same as the JSON body: %j', (body) => {
        const query = lapisRequestToQueryString(body);
        expect(query).toBeDefined();
        expect(asEngineSeesGet(query!)).toEqual(asEngineSeesJson(body));
    });

    test('encodes arrays as repeated keys, in order, with values percent-encoded', () => {
        expect(
            lapisRequestToQueryString({
                geoLocCountry: ['A, B', 'C'],
                fields: ['x', 'y'],
                limit: 5,
                isRevocation: true,
                orderBy: [{ field: 'x', type: 'ascending' }, 'y'],
            }),
        ).toBe(
            'geoLocCountry=A%2C%20B&geoLocCountry=C&fields=x&fields=y&limit=5&isRevocation=true&orderBy=x&orderBy=y',
        );
    });

    test.each([
        ['a null filter value', { geoLocCountry: null }],
        ['a null inside an array', { geoLocCountry: ['USA', null] }],
        ['an empty array', { geoLocCountry: [] }],
        ['descending orderBy', { orderBy: [{ field: 'date', type: 'descending' }] }],
        ['a random orderBy object', { orderBy: [{ random: 42 }] }],
        ['an orderBy object with extra keys', { orderBy: [{ field: 'a', type: 'ascending', nulls: 'first' }] }],
        ['a nested object', { filter: { a: 1 } }],
        ['a comma inside a comma-split parameter', { fields: ['a,b'] }],
        ['padding inside a comma-split parameter', { nucleotideMutations: [' C3000T'] }],
        ['a fractional limit', { limit: 1.5 }],
        ['a non-finite number', { lengthFrom: Number.NaN }],
    ])('keeps POST for %s', (_, body) => {
        expect(lapisRequestToQueryString(body)).toBeUndefined();
    });

    test.each([
        ['a JSON string', '{"a":1}'],
        ['FormData', new FormData()],
        ['an array', [1]],
    ])('keeps POST for a body that is %s', (_, body) => {
        expect(lapisRequestToQueryString(body)).toBeUndefined();
    });
});

describe('toGetIfShort', () => {
    test('turns a short POST into a GET without body or Content-Type', () => {
        const result = toGetIfShort(config({ accessionVersion: 'LOC_1.1', fields: ['a', 'b'] }));
        expect(result.method).toBe('get');
        expect(result.url).toBe('/sample/details?accessionVersion=LOC_1.1&fields=a&fields=b');
        expect(result.data).toBeUndefined();
        expect(result.headers.has('Content-Type')).toBe(false);
        expect(axios.getUri(result)).toBe(
            'http://lapis.dummy/mpox/sample/details?accessionVersion=LOC_1.1&fields=a&fields=b',
        );
    });

    test('an empty body becomes a bare GET', () => {
        expect(toGetIfShort(config(undefined))).toMatchObject({ method: 'get', url: '/sample/details' });
    });

    test('measures the full URL, including an absolute request URL, against the limit', () => {
        const base = 'http://lapis.dummy/mpox/sample/details?accessionVersion=';
        const fits = 'x'.repeat(LAPIS_GET_MAX_URL_LENGTH - base.length);
        expect(toGetIfShort(config({ accessionVersion: fits })).method).toBe('get');
        expect(toGetIfShort(config({ accessionVersion: `${fits}x` })).method).toBe('post');

        const absolute = config(
            { accessionVersion: fits },
            { baseURL: 'http://other/', url: `http://lapis.dummy/mpox/sample/details` },
        );
        expect(toGetIfShort(absolute).method).toBe('get');
    });

    test('a long accession list stays a POST with its JSON body', () => {
        const accessionVersion = Array.from({ length: 150 }, (_, i) => `LOC_${String(i).padStart(7, '0')}.1`);
        const result = toGetIfShort(config({ accessionVersion }));
        expect(result.method).toBe('post');
        expect(result.data).toEqual({ accessionVersion });
        expect(result.headers.get('Content-Type')).toBe('application/json');
    });

    test('leaves non-POST, streamed and parameterised requests alone', () => {
        expect(toGetIfShort(config({ a: 1 }, { method: 'put' })).method).toBe('put');
        expect(toGetIfShort(config({ a: 1 }, { responseType: 'stream' })).method).toBe('post');
        expect(toGetIfShort(config({ a: 1 }, { params: { b: 2 } })).method).toBe('post');
    });
});

describe('sendShortLapisRequestsAsGet with the conditional cache', () => {
    function setup() {
        const lapis = fakeLapis((request) => {
            const tag = `W/"1-${request.url}-${typeof request.data === 'string' ? request.data : ''}"`;
            return request.ifNoneMatch === tag
                ? { status: 304, headers: { ETag: tag } }
                : { status: 200, headers: { 'ETag': tag, 'Content-Type': 'application/json' }, body: '{"data":[1]}' };
        });
        const adapter = createConditionalCacheAdapter({
            store: new MemoryCacheStore(1024 * 1024, utf16StringCodec),
            baseAdapter: lapis.adapter,
        });
        const instance = axios.create({ baseURL: 'http://lapis.dummy/mpox', adapter });
        sendShortLapisRequestsAsGet(instance);
        return { instance, requests: lapis.requests };
    }

    test('a short query is sent as GET and revalidated with If-None-Match', async () => {
        const { instance, requests } = setup();
        const first = await instance.post('/sample/details', { accessionVersion: 'LOC_1.1' });
        const second = await instance.post('/sample/details', { accessionVersion: 'LOC_1.1' });

        expect(first.data).toEqual({ data: [1] });
        expect(second.data).toEqual({ data: [1] });
        expect(second.headers['x-loculus-lapis-cache']).toBe('revalidated');
        expect(requests.map((r) => [r.method, r.url, r.data, r.ifNoneMatch])).toEqual([
            ['get', 'http://lapis.dummy/mpox/sample/details?accessionVersion=LOC_1.1', undefined, undefined],
            [
                'get',
                'http://lapis.dummy/mpox/sample/details?accessionVersion=LOC_1.1',
                undefined,
                'W/"1-http://lapis.dummy/mpox/sample/details?accessionVersion=LOC_1.1-"',
            ],
        ]);
    });

    test('a query GET cannot express stays POST and is revalidated too', async () => {
        const { instance, requests } = setup();
        const body = { orderBy: [{ field: 'date', type: 'descending' }], limit: 100 };
        await instance.post('/sample/details', body);
        const second = await instance.post('/sample/details', body);

        expect(second.headers['x-loculus-lapis-cache']).toBe('revalidated');
        expect(requests.map((r) => r.method)).toEqual(['post', 'post']);
        expect(requests[1].ifNoneMatch).toBeDefined();
    });
});

describe('LapisClient (server side)', () => {
    const schema: Schema = {
        organismName: 'organism',
        metadata: [],
        tableColumns: [],
        defaultOrderBy: 'id',
        defaultOrder: 'ascending',
        primaryKey: 'accessionVersion',
        inputFields: [],
        submissionDataTypes: { consensusSequences: false },
    };

    test('sends sequence-page queries as GET and long ones as POST', async () => {
        const seen: { method: string; url: string; body: string; contentType: string | null }[] = [];
        testServer.use(
            http.all('http://lapis.get/sample/details', async ({ request }) => {
                seen.push({
                    method: request.method,
                    url: request.url,
                    body: await request.text(),
                    contentType: request.headers.get('Content-Type'),
                });
                return HttpResponse.json({ data: [], info: { dataVersion: '1' } });
            }),
        );
        const client = LapisClient.create('http://lapis.get', schema);

        (await client.getSequenceEntryVersionDetails('LOC_1.1'))._unsafeUnwrap();
        (await client.getDetails({ accessionVersion: 'LOC_1.1', fields: ['a'] }))._unsafeUnwrap();
        const many = Array.from({ length: 150 }, (_, i) => `LOC_${String(i).padStart(7, '0')}.1`);
        (await client.getDetails({ accessionVersion: many }))._unsafeUnwrap();

        expect(seen[0]).toEqual({
            method: 'GET',
            url: 'http://lapis.get/sample/details?accessionVersion=LOC_1.1',
            body: '',
            contentType: null,
        });
        expect(seen[1]).toMatchObject({
            method: 'GET',
            url: 'http://lapis.get/sample/details?accessionVersion=LOC_1.1&fields=a&dataFormat=json',
        });
        expect(seen[2].method).toBe('POST');
        expect(JSON.parse(seen[2].body)).toEqual({ accessionVersion: many, dataFormat: 'json' });
    });
});
