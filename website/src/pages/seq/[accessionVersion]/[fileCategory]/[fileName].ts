import type { APIRoute } from 'astro';

import { getRuntimeConfig } from '../../../../config';
import { parseAccessionVersionFromString } from '../../../../utils/extractAccessionVersion';
import { getAccessToken } from '../../../../utils/getAccessToken';

export const GET: APIRoute = async ({ params, locals }) => {
    const runtimeConfig = getRuntimeConfig();
    const { accessionVersion, fileCategory, fileName } = params;
    const { accession, version } = parseAccessionVersionFromString(accessionVersion!);

    const backendUrl = `${runtimeConfig.public.backendUrl}/files/get/${accession}/${version}/${encodeURIComponent(fileCategory!)}/${encodeURIComponent(fileName!)}`;

    const accessToken = getAccessToken(locals.session)!;

    const response = await fetch(backendUrl, {
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
    } else if (response.ok) {
        return new Response(await response.text(), { status: response.status });
    } else {
        const text = await response.text();
        return new Response(text, { status: response.status });
    }
};
