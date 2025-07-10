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
            keycloak: keycloakUrl ?? runtime.serverSide.keycloakUrl,
            website: new URL(request.url).origin,
        },
        version: process.env.LOCULUS_VERSION ?? '',
        minCliVersion: '0.0.0',
        title: website.name,
        description: website.welcomeMessageHTML ?? null,
        organisms: website.organisms,
    };
    return new Response(JSON.stringify(response), {
        headers: {
            'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
        },
    });
};
