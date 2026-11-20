import { getRuntimeConfig, getWebsiteConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('health');
let loggedConfigError = false;

export function GET() {
    try {
        getWebsiteConfig();
        getRuntimeConfig();
    } catch (error) {
        if (!loggedConfigError) {
            logger.error(`Health check failed, config is invalid: ${error}`);
            loggedConfigError = true;
        }
        return new Response('config error', { status: 503 });
    }
    return new Response('ok');
}
