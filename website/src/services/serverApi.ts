import { backendApi } from './backendApi.ts';
import { lapisApi } from './lapisApi.ts';
import { withResult } from './result.ts';
import { getLapisUrl, getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

/**
 * Server-side entry points to the APIs: the same endpoints as `backendApi` / `lapisApi`,
 * but every function returns a neverthrow `Result` instead of throwing.
 * Not usable in the browser, because they read the server-side runtime config.
 */

const backendLogger = getInstanceLogger('backendApi');
const lapisLogger = getInstanceLogger('lapisApi');

export function serverBackendApi(accessToken?: string, backendUrl = getRuntimeConfig().serverSide.backendUrl) {
    return withResult(backendApi(backendUrl, accessToken), { logger: backendLogger, serviceName: 'backend' });
}

export type ServerBackendApi = ReturnType<typeof serverBackendApi>;

export function serverLapisApi(organism: string, lapisUrl = getLapisUrl(getRuntimeConfig().serverSide, organism)) {
    return withResult(lapisApi(lapisUrl), { logger: lapisLogger, serviceName: 'LAPIS' });
}

export type ServerLapisApi = ReturnType<typeof serverLapisApi>;
