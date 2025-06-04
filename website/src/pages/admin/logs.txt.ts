import type { APIRoute } from 'astro';

import { getInstanceLogger } from '../../logger';

export const POST: APIRoute = async ({ request }) => {
    const logToAppend = (await request.json()) as { instance?: string; level?: string; message?: string };

    const message = logToAppend.message;

    // eslint-disable-next-line no-console
    console.log('Endpoint /admin/logs.txt called with log:', logToAppend);

    if (message !== undefined) {
        switch (logToAppend.level) {
            case 'info':
                getInstanceLogger(logToAppend.instance ?? '').info(message);
                break;
            default:
                getInstanceLogger(logToAppend.instance ?? '').error(message);
        }
    }

    return new Response(
        JSON.stringify({
            body: 'ok',
        }),
    );
};
