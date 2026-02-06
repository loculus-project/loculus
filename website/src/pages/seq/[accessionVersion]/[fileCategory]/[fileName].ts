import type { APIRoute } from 'astro';

import { getRuntimeConfig } from '../../../../config';
import { parseAccessionVersionFromString } from '../../../../utils/extractAccessionVersion';
import { getAccessToken } from '../../../../utils/getAccessToken';

async function proxyToBackend({ params, locals }: Parameters<APIRoute>[0], method: 'GET' | 'HEAD'): Promise<Response> {
    const runtimeConfig = getRuntimeConfig();
    const { accessionVersion, fileCategory, fileName } = params;
    const { accession, version } = parseAccessionVersionFromString(accessionVersion!);

    const backendUrl = `${runtimeConfig.serverSide.backendUrl}/files/get/${accession}/${version}/${encodeURIComponent(fileCategory!)}/${encodeURIComponent(fileName!)}`;

    const accessToken = getAccessToken(locals.session)!;

    const response = await fetch(backendUrl, {
        method,
        redirect: 'manual',
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (response.status === 307 || response.status === 302) {
        const s3Url = response.headers.get('Location');
        if (!s3Url) {
            return new Response('Backend redirect missing Location header', { status: 500 });
        }
        return new Response(null, {
            status: response.status,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            headers: { Location: s3Url },
        });
    }

    return new Response(response.body, { status: response.status, headers: new Headers(response.headers) });
}

export const GET: APIRoute = (ctx) => proxyToBackend(ctx, 'GET');
export const HEAD: APIRoute = (ctx) => proxyToBackend(ctx, 'HEAD');
