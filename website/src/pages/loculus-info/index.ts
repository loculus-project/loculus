import type { APIRoute } from 'astro';

import { getRuntimeConfig, getWebsiteConfig } from '../../config';
import { getAuthBaseUrl } from '../../utils/getAuthUrl';

const corsHeaders = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Access-Control-Allow-Origin': '*',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'Access-Control-Allow-Headers': 'Content-Type',
} as const;

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
            ...corsHeaders,
            'Content-Type': 'application/json', // eslint-disable-line @typescript-eslint/naming-convention
        },
    });
};

export const OPTIONS: APIRoute = () =>
    new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
