/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names follow the protocol. */
import type { APIRoute } from 'astro';

import { getConfiguredOrganisms, getLapisUrl, getRuntimeConfig, loginIsRequired } from '../../../config';
import { getInstanceAccess } from '../../../utils/instanceAccess';

/** Policy lives in the backend; this route enforces its decision and streams query results. */
export const ALL: APIRoute = async ({ params, request, locals, url }) => {
    if (!loginIsRequired()) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD', 'POST'].includes(request.method)) {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD, POST' } });
    }
    const authorization = request.headers.get('Authorization');
    if (authorization !== null && !/^Bearer \S+$/i.test(authorization)) {
        return new Response('Invalid authorization header', { status: 401 });
    }
    // Explicit credentials take precedence over cookies; never silently downgrade invalid credentials.
    const token = authorization?.slice(7) ?? locals.session?.token?.accessToken;
    if (!token) return new Response('Authentication required', { status: 401 });
    const access = await getInstanceAccess(token);
    if (!access) return new Response('Authentication or access validation failed', { status: 401 });
    if (!access.canReadReleasedData) return new Response('Access denied', { status: 403 });

    const organism = params.organism;
    if (!getConfiguredOrganisms().some((entry) => entry.key === organism)) {
        return new Response('Unknown organism', { status: 404 });
    }
    const base = new URL(`${getLapisUrl(getRuntimeConfig().serverSide, organism!)}/`);
    const path = params.path ?? '';
    // No traversal, alternate upstreams, or encoded path separators.
    if (path.startsWith('/') || path.split('/').some((part) => ['.', '..'].includes(part)) || /[%\\]/.test(path)) {
        return new Response('Invalid query path', { status: 400 });
    }
    if (!/^(sample\/|component\/|query\/parse$)/.test(path)) {
        return new Response('Unknown query endpoint', { status: 404 });
    }
    const target = new URL(path, base);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
        return new Response('Invalid query path', { status: 400 });
    }
    target.search = url.search;
    const headers = new Headers({ 'Accept-Encoding': 'identity' });
    for (const name of ['accept', 'content-type']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    try {
        // Only queries use POST. Bound request bodies; responses are never buffered.
        const body = request.method === 'POST' ? await readQueryBody(request) : undefined;
        if (body === null) return new Response('Query too large', { status: 413 });
        const upstream = await fetch(target, {
            method: request.method,
            headers,
            body,
            redirect: 'manual',
            signal: request.signal,
        });
        if (upstream.status >= 300 && upstream.status < 400)
            return new Response('Unexpected upstream redirect', { status: 502 });
        const responseHeaders = new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Authorization, Cookie' });
        for (const name of ['content-type', 'content-disposition', 'data-version']) {
            const value = upstream.headers.get(name);
            if (value) responseHeaders.set(name, value);
        }
        // Node fetch decodes gzip/deflate/br. Preserve zstd, which it does not decode.
        const encoding = upstream.headers.get('content-encoding');
        if (encoding && !['gzip', 'deflate', 'br', 'x-gzip'].includes(encoding.toLowerCase())) {
            responseHeaders.set('content-encoding', encoding);
        }
        return new Response(request.method === 'HEAD' ? null : upstream.body, {
            status: upstream.status,
            headers: responseHeaders,
        });
    } catch {
        return new Response('Query service unavailable', { status: 502 });
    }
};

async function readQueryBody(request: Request): Promise<ArrayBuffer | null> {
    const limit = 1_048_576;
    const reader = request.body?.getReader();
    if (!reader) return new ArrayBuffer(0);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result.buffer;
}
