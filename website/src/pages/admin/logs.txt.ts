import type { APIRoute } from 'astro';

import { getInstanceLogger } from '../../logger';

export const POST: APIRoute = async ({ request }) => {
    const logToAppend = (await request.json()) as { instance?: string; level?: string; message?: string };

    const message = logToAppend.message;

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
