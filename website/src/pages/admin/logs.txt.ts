import type { APIRoute } from 'astro';

import { logger } from '../../logger';

export const POST: APIRoute = async ({ request }) => {
    const logToAppend = await request.json();
    logger.log(logToAppend.level, logToAppend.message);
    return new Response(
        JSON.stringify({
            body: 'ok',
        }),
    );
};
