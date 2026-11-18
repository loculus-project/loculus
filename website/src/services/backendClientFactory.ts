import { getRuntimeConfig } from '../config';
import { BackendClient } from './backendClient';
import { getInstanceLogger } from '../logger';

const logger = getInstanceLogger('BackendClient');

/**
 * Create a new server-side {@link BackendClient} by using {@link getRuntimeConfig}
 * to configure the client.
 */
export function createBackendClient(): BackendClient {
    return new BackendClient(getRuntimeConfig().serverSide.backendUrl, logger);
}
