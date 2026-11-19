import { backendApi } from './backendApi.ts';
import { sequenceEntryLapisApi } from './lapisApi.ts';
import { withResult } from './result.ts';
import { getLapisUrl, getRuntimeConfig, getSchema } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

/**
 * Server-side entry points to the APIs. Every function returns a neverthrow `Result` instead of throwing.
 * Not usable in the browser, because they read the server-side runtime config.
 */

const backendLogger = getInstanceLogger('backendApi');
const lapisLogger = getInstanceLogger('lapisApi');

export function serverBackendApi(accessToken?: string, backendUrl = getRuntimeConfig().serverSide.backendUrl) {
    return withResult(backendApi(backendUrl, accessToken), { logger: backendLogger, serviceName: 'backend' });
}

export type ServerBackendApi = ReturnType<typeof serverBackendApi>;

export function serverLapisApi(organism: string) {
    return lapisApiWithResult(getLapisUrl(getRuntimeConfig().serverSide, organism), getSchema(organism).primaryKey);
}

export function lapisApiWithResult(lapisUrl: string, primaryKey: string) {
    return withResult(sequenceEntryLapisApi(lapisUrl, primaryKey), { logger: lapisLogger, serviceName: 'LAPIS' });
}

export type ServerLapisApi = ReturnType<typeof serverLapisApi>;
