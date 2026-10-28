import type { APIRoute } from 'astro';

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

// Content-Encoding and Content-Length are not forwarded: fetch already decodes compressed responses.
const forwardedResponseHeaders = ['Content-Type', 'Content-Disposition'];

async function proxyToLapis({ params, request, locals }: Parameters<APIRoute>[0]): Promise<Response> {
    const { organism, endpoint } = params;
    if (organism === undefined || endpoint === undefined || !downloadEndpoints.test(endpoint)) {
        return new Response(undefined, { status: 404 });
    }

    const lapisUrl = new URL(`${getLapisUrl(getRuntimeConfig().serverSide, organism)}/sample/${endpoint}`);
    lapisUrl.search = new URL(request.url).search;

    const headers = new Headers(createAuthorizationHeader(getForwardedAccessToken(request, locals.session)));
    const contentType = request.headers.get('Content-Type');
    if (contentType !== null) {
        headers.set('Content-Type', contentType);
    }

    const lapisResponse = await fetch(lapisUrl.href, {
        method: request.method,
        headers,
        body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
    });

    const responseHeaders = new Headers();
    for (const name of forwardedResponseHeaders) {
        const value = lapisResponse.headers.get(name);
        if (value !== null) {
            responseHeaders.set(name, value);
        }
    }
    return new Response(lapisResponse.body, { status: lapisResponse.status, headers: responseHeaders });
}

export const GET: APIRoute = (context) => proxyToLapis(context);
export const POST: APIRoute = (context) => proxyToLapis(context);
