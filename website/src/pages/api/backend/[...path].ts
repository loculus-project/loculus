import type { APIContext, APIRoute } from 'astro';

import { getRuntimeConfig } from '../../../config.ts';
import { getInstanceLogger } from '../../../logger.ts';
import { BACKEND_PROXY_PATH } from '../../../services/backendApi.ts';
import { createAuthorizationHeader } from '../../../utils/createAuthorizationHeader.ts';
import { getAccessToken } from '../../../utils/getAccessToken.ts';

/**
 * Proxies browser requests to the backend and adds the user's access token from the (httpOnly) session cookie.
 * This way, the access token never has to be handed to client-side code.
 *
 * `/api/backend/<path>?<query>` is forwarded to `<backendUrl>/<path>?<query>`.
 */

const logger = getInstanceLogger('backendProxy');

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type'];

/** Hop-by-hop headers, and headers that no longer match the body after `fetch` has decoded it */
const DROPPED_RESPONSE_HEADERS = [
    'connection',
    'keep-alive',
    'transfer-encoding',
    'content-encoding',
    'content-length',
    'set-cookie',
];

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * CSRF protection: the session cookie is `SameSite=Lax`, so browsers don't send it on cross-site POSTs anyway.
 * As defense in depth, we also reject state-changing requests that the browser marks as cross-site.
 */
function isCrossSiteRequest(request: Request): boolean {
    const fetchSite = request.headers.get('sec-fetch-site');
    if (fetchSite !== null) {
        return fetchSite !== 'same-origin';
    }
    const origin = request.headers.get('origin');
    if (origin === null) {
        return false;
    }
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return new URL(origin).host !== host;
}

async function proxyToBackend({ request, url, locals }: APIContext): Promise<Response> {
    if (!SAFE_METHODS.includes(request.method) && isCrossSiteRequest(request)) {
        return new Response('Cross-site requests are not allowed', { status: 403 });
    }

    // `url.pathname` is already normalized (no `..` segments) and still URL-encoded
    if (!url.pathname.startsWith(`${BACKEND_PROXY_PATH}/`)) {
        return new Response(undefined, { status: 404 });
    }
    const backendPath = url.pathname.slice(BACKEND_PROXY_PATH.length);
    const target = `${getRuntimeConfig().serverSide.backendUrl}${backendPath}${url.search}`;

    const headers = new Headers(createAuthorizationHeader(getAccessToken(locals.session)));
    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = request.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    let response: Response;
    try {
        response = await fetch(target, {
            method: request.method,
            headers,
            body: hasBody ? request.body : undefined,
            redirect: 'manual',
            signal: request.signal,
            // Required by Node's fetch to stream a request body, e.g. large submission files
            ...(hasBody ? { duplex: 'half' } : {}),
        });
    } catch (error) {
        logger.error(`Failed to proxy ${request.method} ${backendPath}: ${String(error)}`);
        return new Response('Backend not reachable', { status: 502 });
    }

    const responseHeaders = new Headers(response.headers);
    for (const name of DROPPED_RESPONSE_HEADERS) {
        responseHeaders.delete(name);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const ALL: APIRoute = proxyToBackend;
