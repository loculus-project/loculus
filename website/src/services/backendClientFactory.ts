import { getRuntimeConfig } from '../config';
import { BackendClient } from './backendClient';

export function createBackendClient(): BackendClient {
    return new BackendClient(getRuntimeConfig().serverSide.backendUrl);
}
