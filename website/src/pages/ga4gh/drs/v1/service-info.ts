/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { APIRoute } from 'astro';

import { getWebsiteConfig } from '../../../config';

/**
 * DRS Service Info type definition according to GA4GH Service Info v1.x
 */
interface DrsServiceInfo {
    id: string;
    name: string;
    description: string;
    organization: {
        name: string;
        url: string;
    };
    contactUrl: string;
    documentationUrl: string;
    createdAt: string;
    updatedAt: string;
    environment: string;
    version: string;
    type: {
        group: string;
        artifact: string;
        version: string;
    };
}

/**
 * GA4GH DRS API service info endpoint
 *
 * This implements the GET /ga4gh/drs/v1/service-info endpoint from the GA4GH DRS specification
 * https://ga4gh.github.io/data-repository-service-schemas/
 */
export const GET: APIRoute = async ({ request }): Promise<Response> => {
    // Get the site URL base from request
    const origin = new URL(request.url).origin;

    // Get website name from config - add an await to satisfy the linter
    await new Promise((resolve) => setTimeout(resolve, 0));
    const websiteConfig = getWebsiteConfig();
    const siteName = websiteConfig.name || 'Loculus';

    // Construct the service info response
    const serviceInfo: DrsServiceInfo = {
        id: 'loculus-drs',
        name: `${siteName} Data Repository Service`,
        description: `GA4GH DRS implementation for ${siteName} sequences`,
        organization: {
            name: siteName,
            url: origin,
        },
        contactUrl: origin,
        documentationUrl: `${origin}/docs/`,
        createdAt: '2025-04-02T00:00:00Z',
        updatedAt: '2025-04-02T00:00:00Z',
        environment: 'prod',
        version: '1.0.0',
        type: {
            group: 'org.ga4gh',
            artifact: 'drs',
            version: '1.2.0',
        },
    };

    return new Response(JSON.stringify(serviceInfo), {
        status: 200,

        headers: {
            'Content-Type': 'application/json',
        },
    });
};
