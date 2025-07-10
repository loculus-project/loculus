import type { APIRoute } from 'astro';

import { getRuntimeConfig, getWebsiteConfig } from '../../config';
import { getAuthBaseUrl } from '../../utils/getAuthUrl';

export const GET: APIRoute = async ({ request }) => {
    const runtime = getRuntimeConfig();
    const website = getWebsiteConfig();
    const keycloakUrl = await getAuthBaseUrl();
    const response = {
        hosts: {
            backend: runtime.public.backendUrl,
            lapis: runtime.public.lapisUrls,
            keycloak: keycloakUrl,
            website: new URL(request.url).origin,
        },
        minCliVersion: '0.0.0',
        title: website.name,
        organisms: website.organisms,
    };
    return new Response(JSON.stringify(response), {
        headers: {
            'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
        },
    });
};
