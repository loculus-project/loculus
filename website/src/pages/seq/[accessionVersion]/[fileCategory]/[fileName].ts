import type { APIRoute } from 'astro';

import { getRuntimeConfig } from '../../../../config';
import { createAuthorizationHeader } from '../../../../utils/createAuthorizationHeader';
import { parseAccessionVersionFromString } from '../../../../utils/extractAccessionVersion';
import { getAccessToken } from '../../../../utils/getAccessToken';

// Allow requests from any origin
// Same as the backend allows on /files/get, which this route proxies
function withCorsHeader(headers: Headers): Headers {
    headers.set('Access-Control-Allow-Origin', '*');
    return headers;
}

async function proxyToBackend({ params, locals }: Parameters<APIRoute>[0], method: 'GET' | 'HEAD'): Promise<Response> {
    const runtimeConfig = getRuntimeConfig();
    const { accessionVersion, fileCategory, fileName } = params;
    const { accession, version } = parseAccessionVersionFromString(accessionVersion!);

    const backendUrl = `${runtimeConfig.serverSide.backendUrl}/files/get/${accession}/${version}/${encodeURIComponent(fileCategory!)}/${encodeURIComponent(fileName!)}`;

    const accessToken = getAccessToken(locals.session);

    const response = await fetch(backendUrl, {
        method,
        redirect: 'manual',
        headers: createAuthorizationHeader(accessToken),
    });

    if (response.status === 307 || response.status === 302) {
        const s3Url = response.headers.get('Location');
        if (!s3Url) {
            return new Response('Backend redirect missing Location header', {
                status: 500,
                headers: withCorsHeader(new Headers()),
            });
        }
        return new Response(null, {
            status: response.status,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: withCorsHeader(new Headers({ Location: s3Url })),
        });
    }

    return new Response(response.body, {
        status: response.status,
        headers: withCorsHeader(new Headers(response.headers)),
    });
}

export const GET: APIRoute = (ctx) => proxyToBackend(ctx, 'GET');
export const HEAD: APIRoute = (ctx) => proxyToBackend(ctx, 'HEAD');
