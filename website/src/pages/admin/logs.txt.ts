import type { APIRoute } from 'astro';

import { getInstanceLogger } from '../../logger';

export const POST: APIRoute = async ({ request }) => {
    const logToAppend = await request.json();

    switch (logToAppend.level) {
        case 'info':
            getInstanceLogger(logToAppend.instance).info(logToAppend.message);
            break;
        default:
            getInstanceLogger(logToAppend.instance).error(logToAppend.message);
    }

    return new Response(
        JSON.stringify({
            body: 'ok',
        }),
    );
};
