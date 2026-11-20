import { getRuntimeConfig, getWebsiteConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

const logger = getInstanceLogger('health');

// Target of the Kubernetes probes. Checks only the pod's static config, so a pod with a broken config never
// becomes ready and crash-loops. Must stay independent of LAPIS, the backend and Keycloak.
export function GET() {
    try {
        getWebsiteConfig();
        getRuntimeConfig();
    } catch (error) {
        logger.error(`Health check failed, config is invalid: ${(error as Error).message}`);
        return new Response('config error', { status: 503 });
    }
    return new Response('ok');
}
