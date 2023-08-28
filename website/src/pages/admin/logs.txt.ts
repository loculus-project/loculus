import type { APIRoute } from 'astro';

import { logger } from '../../logger';

export const post: APIRoute = async ({ request }) => {
    const logToAppend = await request.json();
    logger.log(logToAppend.level, logToAppend.message);
    return {
        body: 'ok',
    };
};
