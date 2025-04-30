import type { APIRoute } from 'astro';
import { getRuntimeConfig } from '../../../../../config';

export const GET: APIRoute = ({ params, url }) => {
    const runtimeConfig = getRuntimeConfig();
    const { accessionVersion, fileCategory, fileName } = params;

    const redirectUrl = `${runtimeConfig.public.backendUrl}/files/get/${accessionVersion}/${fileCategory}/${fileName}`;
    return new Response(null, {
        status: 302,
        headers: {
            Location: redirectUrl
        }
    });
};
