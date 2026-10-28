import { Readable } from 'node:stream';

import type { APIRoute } from 'astro';
import axios from 'axios';

import { getLapisUrl, getRuntimeConfig } from '../../../../config';
import { createAuthorizationHeader } from '../../../../utils/createAuthorizationHeader';
import { getForwardedAccessToken } from '../../../../utils/getAccessToken';

/**
 * Streams LAPIS downloads to the browser with the user's access token. Used by the download dialog when the instance
 * sets `auth.requireAuthenticationForData`: a plain link or form submission cannot send an Authorization header.
 */

// Only the endpoints used by the DownloadUrlGenerator
const downloadEndpoints =
    /^(details|unalignedNucleotideSequences(\/[^/]+)?|alignedNucleotideSequences(\/[^/]+)?|alignedAminoAcidSequences\/[^/]+)$/;

// Forwarded as they are, so that compressed downloads reach the browser unchanged. The browser's Accept-Encoding is
// forwarded to LAPIS, and axios does not decompress the response (`decompress: false`).
const forwardedResponseHeaders = ['Content-Type', 'Content-Disposition', 'Content-Encoding', 'Content-Length'];

async function proxyToLapis({ params, request, locals }: Parameters<APIRoute>[0]): Promise<Response> {
    const { organism, endpoint } = params;
    if (organism === undefined || endpoint === undefined || !downloadEndpoints.test(endpoint)) {
        return new Response(undefined, { status: 404 });
    }

    const lapisUrl = new URL(`${getLapisUrl(getRuntimeConfig().serverSide, organism)}/sample/${endpoint}`);
    lapisUrl.search = new URL(request.url).search;

    const headers = new Headers(createAuthorizationHeader(getForwardedAccessToken(request, locals.session)));
    // axios would otherwise send its default `application/json, text/plain, */*`, and LAPIS then answers with JSON
    headers.set('Accept', '*/*');
    for (const name of ['Content-Type', 'Accept-Encoding']) {
        const value = request.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }

    const lapisResponse = await axios.request<Readable>({
        url: lapisUrl.href,
        method: request.method,
        headers: Object.fromEntries(headers),
        data: request.method === 'POST' ? Buffer.from(await request.arrayBuffer()) : undefined,
        responseType: 'stream',
        decompress: false,
        validateStatus: () => true,
    });

    const responseHeaders = new Headers();
    for (const name of forwardedResponseHeaders) {
        const value = lapisResponse.headers[name.toLowerCase()];
        if (value !== undefined) {
            responseHeaders.set(name, String(value));
        }
    }
    return new Response(Readable.toWeb(lapisResponse.data) as ReadableStream, {
        status: lapisResponse.status,
        headers: responseHeaders,
    });
}

export const GET: APIRoute = (context) => proxyToLapis(context);
export const POST: APIRoute = (context) => proxyToLapis(context);
