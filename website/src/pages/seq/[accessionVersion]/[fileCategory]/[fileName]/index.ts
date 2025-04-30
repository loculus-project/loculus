import type { APIRoute } from 'astro';

import { getRuntimeConfig } from '../../../../../config';
import { parseAccessionVersionFromString } from '../../../../../utils/extractAccessionVersion';

export const GET: APIRoute = ({ params }) => {
    const runtimeConfig = getRuntimeConfig();
    const { accessionVersion, fileCategory, fileName } = params;
    const { accession, version } = parseAccessionVersionFromString(accessionVersion!);

    const redirectUrl = `${runtimeConfig.public.backendUrl}/files/get/${accession}/${version}/${fileCategory}/${fileName}`;
    return new Response(null, {
        status: 302,
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Location: redirectUrl,
        },
    });
};
