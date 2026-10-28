import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { GET, POST } from './[...endpoint]';

vi.mock('../../../../config', () => ({
    getRuntimeConfig: () => ({ serverSide: { lapisUrls: { ebola: 'http://lapis-ebola:8080' } } }),
    getLapisUrl: (serverSide: { lapisUrls: Record<string, string> }, organism: string) =>
        serverSide.lapisUrls[organism],
}));

const loggedIn: Session = { isLoggedIn: true, token: { accessToken: 'session-token', refreshToken: 'refresh-token' } };

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('data'));
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function callRoute(
    endpoint: string,
    { session = loggedIn, init = {}, query = '' }: { session?: Session; init?: RequestInit; query?: string } = {},
): Promise<Response> {
    const request = new Request(`http://website/ebola/lapis-download/sample/${endpoint}${query}`, init);
    const context = { params: { organism: 'ebola', endpoint }, request, locals: { session } } as unknown as APIContext;
    return (init.method === 'POST' ? POST(context) : GET(context)) as Promise<Response>;
}

const lapisRequest = () => {
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    return { url: url as string, init: init!, headers: new Headers(init!.headers) };
};

describe('LAPIS download proxy route', () => {
    test('forwards GET downloads with the query and the session token to the internal LAPIS', async () => {
        await callRoute('unalignedNucleotideSequences/L', { query: '?downloadAsFile=true&country=Germany' });

        const { url, init, headers } = lapisRequest();
        expect(url).toBe(
            'http://lapis-ebola:8080/sample/unalignedNucleotideSequences/L?downloadAsFile=true&country=Germany',
        );
        expect(init.method).toBe('GET');
        expect(headers.get('Authorization')).toBe('Bearer session-token');
    });

    test('forwards the form body of POST downloads', async () => {
        const body = new URLSearchParams([
            ['fields', 'country'],
            ['fields', 'date'],
        ]);
        await callRoute('details', { init: { method: 'POST', body } });

        const { init, headers } = lapisRequest();
        expect(init.method).toBe('POST');
        expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('fields=country&fields=date');
        expect(headers.get('Content-Type')).toContain('application/x-www-form-urlencoded');
    });

    test("prefers the caller's bearer token over the session token", async () => {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        await callRoute('details', { init: { headers: { Authorization: 'Bearer api-client-token' } } });

        expect(lapisRequest().headers.get('Authorization')).toBe('Bearer api-client-token');
    });

    test('sends no token for anonymous callers and passes on the 401 from LAPIS', async () => {
        fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));

        const response = await callRoute('details', { session: { isLoggedIn: false } });

        expect(lapisRequest().headers.has('Authorization')).toBe(false);
        expect(response.status).toBe(401);
    });

    test('only forwards the headers needed for the download', async () => {
        fetchMock.mockResolvedValue(
            new Response('data', {
                headers: {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    'Content-Type': 'text/x-fasta',
                    'Content-Disposition': 'attachment; filename="ebola.fasta"',
                    'Set-Cookie': 'lapis=1',
                    /* eslint-enable @typescript-eslint/naming-convention */
                },
            }),
        );

        const response = await callRoute('unalignedNucleotideSequences');

        expect(response.headers.get('Content-Type')).toBe('text/x-fasta');
        expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="ebola.fasta"');
        expect(response.headers.has('Set-Cookie')).toBe(false);
    });

    test('streams the response instead of buffering it', async () => {
        // The stream never closes, so buffering the response would never finish
        const neverEndingStream = new ReadableStream<Uint8Array>({
            start: (controller) => controller.enqueue(new TextEncoder().encode('first chunk')),
        });
        fetchMock.mockResolvedValue(new Response(neverEndingStream));

        const response = await callRoute('details');
        const { value } = await response.body!.getReader().read();

        expect(new TextDecoder().decode(value)).toBe('first chunk');
    });

    test.each(['aggregated', 'nucleotideMutations', 'details/extra', '../admin', 'alignedAminoAcidSequences'])(
        'rejects endpoint %s that is not used for downloads',
        async (endpoint) => {
            const response = await callRoute(endpoint);

            expect(response.status).toBe(404);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
});
