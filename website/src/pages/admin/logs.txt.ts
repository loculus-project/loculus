import type { APIRoute } from 'astro';

import { logger } from '../../logger';

export const POST: APIRoute = async ({ request }) => {
    const logToAppend = await request.json();
    logger.log({ level: logToAppend.level, message: logToAppend.message, instance: logToAppend.instance });
    return new Response(
        JSON.stringify({
            body: 'ok',
        }),
    );
};
