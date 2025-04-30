import type { APIRoute } from 'astro';

import { getRuntimeConfig } from '../../../../../config';

export const GET: APIRoute = ({ params }) => {
    const runtimeConfig = getRuntimeConfig();
    const { accessionVersion, fileCategory, fileName } = params;

    const redirectUrl = `${runtimeConfig.public.backendUrl}/files/get/${accessionVersion}/${fileCategory}/${fileName}`;
    return new Response(null, {
        status: 302,
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Location: redirectUrl,
        },
    });
};
