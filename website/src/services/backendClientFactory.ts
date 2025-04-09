import { getRuntimeConfig } from '../config';
import { BackendClient } from './backendClient';

/**
 * Create a new {@link BackendClient} by using {@link getRuntimeConfig}
 * to configure the client.
 */
export function createBackendClient(): BackendClient {
    return new BackendClient(getRuntimeConfig().serverSide.backendUrl);
}
