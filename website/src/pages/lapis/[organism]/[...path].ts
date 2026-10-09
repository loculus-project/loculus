import type { APIContext, APIRoute } from 'astro';

import { getLapisUrl, getRuntimeConfig, loginIsRequired } from '../../../config.ts';
import { getInstanceLogger } from '../../../logger.ts';

const logger = getInstanceLogger('lapisProxy');

/**
 * Same-origin proxy in front of LAPIS.
 *
 * On instances that run with `requireLogin`, LAPIS is not exposed to the internet and the
 * browser reaches it only through this route. Because the route is same-origin with the
 * website, the httpOnly session cookie set by the auth middleware is sent automatically.
 * That is what makes plain `<a href>` download links work - they cannot carry an
 * Authorization header, but they do carry cookies.
 *
 * Request bodies are buffered (LAPIS queries are small JSON documents), response bodies are
 * streamed, because sequence downloads can be many gigabytes.
 */

/**
 * Hop-by-hop headers (RFC 9110 7.6.1) plus headers that describe the browser's connection to
 * the website rather than our connection to LAPIS.
 */
const HOP_BY_HOP_HEADERS = [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
];

const REQUEST_HEADERS_NOT_TO_FORWARD = new Set([
    ...HOP_BY_HOP_HEADERS,
    'host',
    'content-length',
    // Session credentials are for the website, LAPIS has no use for them and must not see them.
    'cookie',
    'authorization',
    // Overridden below, see UPSTREAM_ACCEPT_ENCODING.
    'accept-encoding',
]);

const RESPONSE_HEADERS_NOT_TO_FORWARD = new Set([
    ...HOP_BY_HOP_HEADERS,
    // fetch() may have decoded the body, in which case the upstream length no longer applies.
    'content-length',
]);

/**
 * Content encodings that Node's fetch decodes transparently. It leaves the original
 * `content-encoding` header in place while doing so, so forwarding that header verbatim would
 * tell the browser to decode an already decoded body. Encodings that are not in this set
 * (notably zstd, which LAPIS offers for downloads) pass through untouched and keep their header.
 */
const ENCODINGS_DECODED_BY_FETCH = new Set(['gzip', 'x-gzip', 'deflate', 'br']);

/**
 * Ask LAPIS not to compress: the edge (Traefik) compresses the response to the browser anyway,
 * and this avoids a decode/re-encode round trip in the website process.
 */
const UPSTREAM_ACCEPT_ENCODING = 'identity';

function problemDetail(status: number, title: string, detail: string, instance: string) {
    return new Response(JSON.stringify({ type: 'about:blank', title, detail, status, instance }), {
        status,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        headers: { 'Content-Type': 'application/problem+json' },
    });
}

function forwardedRequestHeaders(request: Request): Headers {
    const headers = new Headers();
    request.headers.forEach((value, key) => {
        if (!REQUEST_HEADERS_NOT_TO_FORWARD.has(key.toLowerCase())) {
            headers.set(key, value);
        }
    });
    headers.set('Accept-Encoding', UPSTREAM_ACCEPT_ENCODING);
    return headers;
}

function forwardedResponseHeaders(response: Response): Headers {
    const headers = new Headers();
    response.headers.forEach((value, key) => {
        const name = key.toLowerCase();
        if (RESPONSE_HEADERS_NOT_TO_FORWARD.has(name)) {
            return;
        }
        if (name === 'content-encoding' && ENCODINGS_DECODED_BY_FETCH.has(value.toLowerCase())) {
            return;
        }
        headers.set(key, value);
    });
    return headers;
}

async function proxyToLapis({ params, request, locals, url }: APIContext): Promise<Response> {
    const organism = params.organism!;
    const path = params.path ?? '';
    const instance = `/lapis/${organism}/${path}`;

    if (loginIsRequired() && locals.session?.isLoggedIn !== true) {
        return problemDetail(401, 'Unauthorized', 'You need to log in to query sequence data.', instance);
    }

    let lapisUrl;
    try {
        lapisUrl = getLapisUrl(getRuntimeConfig().serverSide, organism);
    } catch {
        return problemDetail(404, 'Not Found', `No LAPIS is configured for organism ${organism}.`, instance);
    }

    const method = request.method;
    const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

    let upstreamResponse;
    try {
        upstreamResponse = await fetch(`${lapisUrl}/${path}${url.search}`, {
            method,
            headers: forwardedRequestHeaders(request),
            body,
            redirect: 'manual',
        });
    } catch (error) {
        logger.error(`${method} ${instance}: could not reach LAPIS: ${error}`);
        return problemDetail(502, 'Bad Gateway', 'The sequence query service could not be reached.', instance);
    }

    return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: forwardedResponseHeaders(upstreamResponse),
    });
}

export const GET: APIRoute = proxyToLapis;
export const HEAD: APIRoute = proxyToLapis;
export const POST: APIRoute = proxyToLapis;
