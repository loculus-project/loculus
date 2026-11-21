import { backendApi } from './backendApi.ts';
import { withResult } from './result.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

/**
 * Server-side entry points to the APIs: the same endpoints as `backendApi`,
 * but every function returns a neverthrow `Result` instead of throwing.
 * Not usable in the browser, because they read the server-side runtime config.
 */

const backendLogger = getInstanceLogger('backendApi');

export function serverBackendApi(accessToken?: string, backendUrl = getRuntimeConfig().serverSide.backendUrl) {
    return withResult(backendApi(backendUrl, accessToken), { logger: backendLogger, serviceName: 'backend' });
}

export type ServerBackendApi = ReturnType<typeof serverBackendApi>;
