import { Readable } from 'node:stream';

import type { APIRoute } from 'astro';
import axios, { AxiosHeaders } from 'axios';

import { getRuntimeConfig } from '../../../../config.ts';
import { getInstanceLogger } from '../../../../logger.ts';
import { getAccessToken } from '../../../../utils/getAccessToken.ts';

/**
 * Same-origin proxy for browser-side LAPIS traffic.
 *
 * The public runtime config points `lapisUrls` at `/api/lapis/<organism>`, so requests from the
 * browser go to the website's own origin (no CORS, no cross-domain cookies). This route forwards
 * them to the LAPIS instance configured under `serverSide.lapisUrls`.
 *
 * When LAPIS authentication is enabled (`lapisAuthEnabled`), data access requires a user
 * session: anonymous callers get a 401, and logged-in users' requests carry the *user's* access
 * token (validated against Keycloak by the auth middleware, which populates `locals.session`).
 * When LAPIS authentication is disabled, requests are forwarded without a token, and anonymous
 * browsing keeps working.
 *
 * The request's method, raw query string and body are forwarded unchanged; LAPIS responses
 * (including `Content-Disposition` for downloads) are streamed through. LAPIS errors are passed
 * through unmodified, except 401/403, which are mapped to a clear 502 problem detail:
 *
 * - with a token forwarded: LAPIS rejecting it is a server-side configuration problem (the
 *   auth middleware already validated the token against the same realm);
 * - without a token forwarded (auth disabled in this website's config): LAPIS demanding one
 *   anyway means the website and LAPIS are out of sync, e.g. a stale website runtime config.
 *
 * In both cases LAPIS's own error body is logged server-side (it contains the actual reason,
 * e.g. a failed JWKS fetch), but not returned to the browser, as it may leak internal details.
 *
 * The proxy request itself deliberately has no axios timeout: a fixed timeout would kill
 * legitimate long-running LAPIS downloads.
 */

const logger = getInstanceLogger('lapisProxy');

const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-length'] as const;

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The LAPIS response body: a stream with the Node.js axios adapter (production), a plain
 * string/ArrayBuffer with browser-like adapters (unit tests).
 */
type MaybeStreamedBody = Readable | string | ArrayBuffer;

function notFoundResponse(organism: string): Response {
    return new Response(
        JSON.stringify({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: `No LAPIS is configured for organism '${organism}'.`,
            instance: '/api/lapis',
        }),
        {
            status: 404,
            headers: { 'Content-Type': 'application/problem+json' }, // eslint-disable-line @typescript-eslint/naming-convention
        },
    );
}

function problemDetailResponse(status: number, title: string, detail: string, instance: string): Response {
    return new Response(
        JSON.stringify({
            type: 'about:blank',
            title,
            status,
            detail,
            instance,
        }),
        {
            status,
            headers: { 'Content-Type': 'application/problem+json' }, // eslint-disable-line @typescript-eslint/naming-convention
        },
    );
}

const MAX_LOGGED_ERROR_BODY_BYTES = 2048;

/**
 * Best-effort read of a LAPIS error body for server-side logging. LAPIS problem-detail bodies
 * are small; the cap guards against unexpectedly large bodies. Never throws: logging must not
 * mask the remapped response.
 */
async function readErrorBodyForLogging(data: MaybeStreamedBody): Promise<string> {
    try {
        if (data instanceof Readable) {
            const chunks: Buffer[] = [];
            let totalLength = 0;
            for await (const chunk of data) {
                const buffer = Buffer.from(chunk as Buffer);
                chunks.push(buffer);
                totalLength += buffer.length;
                if (totalLength >= MAX_LOGGED_ERROR_BODY_BYTES) {
                    break;
                }
            }
            data.destroy();
            return Buffer.concat(chunks).toString('utf8').slice(0, MAX_LOGGED_ERROR_BODY_BYTES);
        }
        if (typeof data === 'string') {
            return data.slice(0, MAX_LOGGED_ERROR_BODY_BYTES);
        }
        if (data instanceof ArrayBuffer) {
            return Buffer.from(data).toString('utf8').slice(0, MAX_LOGGED_ERROR_BODY_BYTES);
        }
    } catch {
        // fall through to the generic marker below
    }
    return '<could not read LAPIS error body>';
}

export const ALL: APIRoute = async ({ params, request, locals }) => {
    const organism = params.organism;
    if (organism === undefined) {
        return notFoundResponse('<missing organism>');
    }

    const instance = `/api/lapis/${organism}`;

    const lapisAuthEnabled = getRuntimeConfig().public.lapisAuthEnabled === true;

    let authorization: string | undefined;
    if (lapisAuthEnabled) {
        const accessToken = getAccessToken(locals.session);
        if (accessToken === undefined) {
            return problemDetailResponse(
                401,
                'Not logged in',
                'Access to LAPIS data requires a logged-in session. Please log in and retry.',
                instance,
            );
        }
        authorization = `Bearer ${accessToken}`;
    }

    const serverSideConfig = getRuntimeConfig().serverSide;
    if (!(organism in serverSideConfig.lapisUrls)) {
        return notFoundResponse(organism);
    }
    const lapisBaseUrl = serverSideConfig.lapisUrls[organism].replace(/\/+$/, '');

    const lapisPath = params.path === undefined ? '' : `/${params.path}`;
    const targetUrl = `${lapisBaseUrl}${lapisPath}${new URL(request.url).search}`;

    const method = request.method.toUpperCase();
    let body: ArrayBuffer | undefined;
    if (!METHODS_WITHOUT_BODY.has(method)) {
        const buffer = await request.arrayBuffer();
        if (buffer.byteLength > 0) {
            body = buffer;
        }
    }

    const headers: Record<string, string> = {};
    if (authorization !== undefined) {
        headers.Authorization = authorization;
    }
    const contentType = request.headers.get('content-type');
    if (contentType !== null) {
        headers['Content-Type'] = contentType;
    }
    const accept = request.headers.get('accept');
    if (accept !== null) {
        headers.Accept = accept;
    }

    try {
        const response = await axios.request<Readable>({
            url: targetUrl,
            method: method,
            headers,
            data: body,
            responseType: 'stream',
            // Pass LAPIS statuses and bodies through to the browser (400/404/500 ... keep their
            // LAPIS-generated problem details); 401/403 are remapped below.
            validateStatus: () => true,
        });

        const data = response.data as MaybeStreamedBody;

        if (response.status === 401 || response.status === 403) {
            // Keep LAPIS's own error body out of the browser-visible response (it may leak
            // internal details), but log it: it holds the actual reason for the rejection
            // (e.g. a failed JWKS fetch, an expired token), which the remapped 502 does not.
            const lapisErrorBody = await readErrorBodyForLogging(data);
            logger.warn(`LAPIS answered with status ${response.status} (${targetUrl}): ${lapisErrorBody}`);
            return problemDetailResponse(
                502,
                'LAPIS rejected the website request',
                authorization === undefined
                    ? `LAPIS answered with status ${response.status} although this website forwarded no ` +
                          'Authorization header. LAPIS authentication seems enabled while this website is ' +
                          'configured without it, so the two are out of sync (e.g. a stale website runtime ' +
                          'config). Please contact the administrators if it persists.'
                    : `LAPIS answered with status ${response.status}: the logged-in user's token was not accepted. ` +
                          'This is a server-side configuration problem; please contact the administrators if it persists.',
                instance,
            );
        }

        const responseHeaders = new Headers();
        // axios responses always carry an AxiosHeaders instance; the static type is just loose.
        const lapisResponseHeaders = response.headers as unknown as AxiosHeaders;
        for (const headerName of FORWARDED_RESPONSE_HEADERS) {
            const value = lapisResponseHeaders.get(headerName);
            if (value !== null) {
                responseHeaders.set(headerName, String(value));
            }
        }

        // In production (Node.js adapter) the body is a stream and is piped through without
        // buffering. Non-stream bodies (e.g. under test environments with a browser-like
        // axios adapter) are passed through as-is.
        const responseBody = data instanceof Readable ? Readable.toWeb(data) : data;

        return new Response(responseBody as BodyInit, {
            status: response.status,
            headers: responseHeaders,
        });
    } catch (error) {
        // Log the internal LAPIS URL server-side, but do not leak it into the browser-visible
        // response: it may contain internal cluster addresses.
        logger.warn(`Could not reach LAPIS (${targetUrl}): ${String(error)}`);
        return problemDetailResponse(
            502,
            'Could not reach LAPIS',
            'The request to LAPIS failed before a response was received. This is a server-side ' +
                'problem; please try again later and contact the administrators if it persists.',
            instance,
        );
    }
};
