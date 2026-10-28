import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';

import type { APIContext } from 'astro';
import axios from 'axios';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { GET, POST } from './[...endpoint]';

vi.mock('axios', () => ({ default: { request: vi.fn() } }));

vi.mock('../../../../config', () => ({
    getRuntimeConfig: () => ({ serverSide: { lapisUrls: { ebola: 'http://lapis-ebola:8080' } } }),
    getLapisUrl: (serverSide: { lapisUrls: Record<string, string> }, organism: string) =>
        serverSide.lapisUrls[organism],
}));

const loggedIn: Session = { isLoggedIn: true, token: { accessToken: 'session-token', refreshToken: 'refresh-token' } };

// eslint-disable-next-line @typescript-eslint/unbound-method
const requestMock = vi.mocked(axios.request);

interface MockLapisResponse {
    status?: number;
    headers?: Record<string, string>;
    body?: Buffer | string;
}

function mockLapisResponse({ status = 200, headers = {}, body = 'data' }: MockLapisResponse = {}) {
    requestMock.mockResolvedValue({ status, headers, data: Readable.from([body]) });
}

beforeEach(() => {
    requestMock.mockReset();
    mockLapisResponse();
});

function callRoute(
    endpoint: string,
    {
        session = loggedIn,
        init = {},
        query = '',
        requestHeaders,
    }: { session?: Session; init?: RequestInit; query?: string; requestHeaders?: Record<string, string> } = {},
): Promise<Response> {
    const request = new Request(`http://website/ebola/lapis-download/sample/${endpoint}${query}`, init);
    if (requestHeaders !== undefined) {
        // The test environment (happy-dom) drops forbidden headers such as Accept-Encoding from Request, unlike browsers
        Object.defineProperty(request, 'headers', { value: new Headers(requestHeaders) });
    }
    const context = { params: { organism: 'ebola', endpoint }, request, locals: { session } } as unknown as APIContext;
    return (init.method === 'POST' ? POST(context) : GET(context)) as Promise<Response>;
}

const lapisRequest = () => {
    expect(requestMock).toHaveBeenCalledOnce();
    const config = requestMock.mock.calls[0][0];
    return { url: config.url!, config, headers: new Headers(config.headers as Record<string, string>) };
};

describe('LAPIS download proxy route', () => {
    test('forwards GET downloads with the query and the session token to the internal LAPIS', async () => {
        await callRoute('unalignedNucleotideSequences/L', { query: '?downloadAsFile=true&country=Germany' });

        const { url, config, headers } = lapisRequest();
        expect(url).toBe(
            'http://lapis-ebola:8080/sample/unalignedNucleotideSequences/L?downloadAsFile=true&country=Germany',
        );
        expect(config.method).toBe('GET');
        expect(headers.get('Authorization')).toBe('Bearer session-token');
    });

    test('forwards the form body of POST downloads', async () => {
        const body = new URLSearchParams([
            ['fields', 'country'],
            ['fields', 'date'],
        ]);
        await callRoute('details', { init: { method: 'POST', body } });

        const { config, headers } = lapisRequest();
        expect(config.method).toBe('POST');
        expect(Buffer.from(config.data as Buffer).toString()).toBe('fields=country&fields=date');
        expect(headers.get('Content-Type')).toContain('application/x-www-form-urlencoded');
    });

    test("prefers the caller's bearer token over the session token", async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await callRoute('details', { init: { headers: { Authorization: 'Bearer api-client-token' } } });

        expect(lapisRequest().headers.get('Authorization')).toBe('Bearer api-client-token');
    });

    test('sends no token for anonymous callers and passes on the 401 from LAPIS', async () => {
        mockLapisResponse({ status: 401, body: 'unauthorized' });

        const response = await callRoute('details', { session: { isLoggedIn: false } });

        expect(lapisRequest().headers.has('Authorization')).toBe(false);
        expect(response.status).toBe(401);
    });

    test('asks LAPIS for the download format, not for the JSON axios sends by default', async () => {
        await callRoute('unalignedNucleotideSequences');

        expect(lapisRequest().headers.get('Accept')).toBe('*/*');
    });

    test('forwards the Accept-Encoding of the browser to LAPIS', async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await callRoute('unalignedNucleotideSequences', { requestHeaders: { 'Accept-Encoding': 'gzip, br' } });

        expect(lapisRequest().headers.get('Accept-Encoding')).toBe('gzip, br');
    });

    test('does not let axios decompress the LAPIS response', async () => {
        await callRoute('unalignedNucleotideSequences');

        expect(lapisRequest().config.decompress).toBe(false);
    });

    test('passes compressed downloads back unchanged, with their encoding and length', async () => {
        const gzippedFasta = gzipSync('>seq1\nACGT\n');
        /* eslint-disable @typescript-eslint/naming-convention */
        mockLapisResponse({
            headers: {
                'content-type': 'application/gzip',
                'content-encoding': 'gzip',
                'content-length': gzippedFasta.length.toString(),
                'content-disposition': 'attachment; filename="x.fa.gz"',
            },
            body: gzippedFasta,
        });
        /* eslint-enable @typescript-eslint/naming-convention */

        const response = await callRoute('unalignedNucleotideSequences', { query: '?compression=gzip' });

        expect(response.headers.get('Content-Encoding')).toBe('gzip');
        expect(response.headers.get('Content-Length')).toBe(gzippedFasta.length.toString());
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="x.fa.gz"');
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(gzippedFasta));
    });

    test('only forwards the headers needed for the download', async () => {
        /* eslint-disable @typescript-eslint/naming-convention */
        mockLapisResponse({
            headers: {
                'content-type': 'text/x-fasta',
                'content-disposition': 'attachment; filename="ebola.fasta"',
                'set-cookie': 'lapis=1',
            },
        });
        /* eslint-enable @typescript-eslint/naming-convention */

        const response = await callRoute('unalignedNucleotideSequences');

        expect(response.headers.get('Content-Type')).toBe('text/x-fasta');
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="ebola.fasta"');
        expect(response.headers.has('Set-Cookie')).toBe(false);
    });

    test('streams the response instead of buffering it', async () => {
        // The stream never ends, so buffering the response would never finish
        const neverEndingStream = new Readable({
            read() {
                this.push('first chunk');
            },
        });
        requestMock.mockResolvedValue({ status: 200, headers: {}, data: neverEndingStream });

        const response = await callRoute('details');
        const { value } = await response.body!.getReader().read();

        expect(new TextDecoder().decode(value)).toBe('first chunk');
    });

    test.each(['aggregated', 'nucleotideMutations', 'details/extra', '../admin', 'alignedAminoAcidSequences'])(
        'rejects endpoint %s that is not used for downloads',
        async (endpoint) => {
            const response = await callRoute(endpoint);

            expect(response.status).toBe(404);
            expect(requestMock).not.toHaveBeenCalled();
        },
    );
});
