import { err, ok, type Result } from 'neverthrow';

import { isApiError } from './apiRequest.ts';
import type { ProblemDetail } from '../types/backend.ts';

/**
 * The subset of a logger that `withResult` needs.
 * Satisfied by both the server-side `InstanceLogger` and the browser `ClientLogger`.
 */
export type ApiLogger = {
    error: (message: string) => unknown;
    info: (message: string) => unknown;
};

/**
 * Throw this from an API function to return a specific problem detail from the `withResult` wrapper,
 * e.g. when the response was valid but didn't contain what we need.
 */
export class ProblemDetailError extends Error {
    constructor(public readonly problemDetail: ProblemDetail) {
        super(problemDetail.detail);
        this.name = 'ProblemDetailError';
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed to accept functions with any parameters
type AsyncFunction = (...args: any[]) => Promise<unknown>;

export type ResultApi<Api extends Record<string, AsyncFunction>> = {
    [K in keyof Api]: (...args: Parameters<Api[K]>) => Promise<Result<Awaited<ReturnType<Api[K]>>, ProblemDetail>>;
};

/**
 * Wraps every function of a (throwing) API object so that it returns a neverthrow `Result` instead.
 * Errors are converted to a `ProblemDetail` and logged.
 *
 * @example
 * const backend = withResult(backendApi(url, token), { logger, serviceName: 'backend' });
 * const groups = await backend.getGroupsOfUser(); // Result<Group[], ProblemDetail>
 */
export function withResult<Api extends Record<string, AsyncFunction>>(
    api: Api,
    { logger, serviceName }: { logger: ApiLogger; serviceName: string },
): ResultApi<Api> {
    const wrapped = Object.fromEntries(
        Object.entries(api).map(([name, fn]) => [
            name,
            async (...args: unknown[]) => {
                try {
                    return ok(await fn(...args));
                } catch (error) {
                    return err(toProblemDetail(error, { logger, serviceName }));
                }
            },
        ]),
    );
    return wrapped as unknown as ResultApi<Api>;
}

/**
 * Converts any error thrown by `sendRequest` (or anything else) into a `ProblemDetail`.
 */
export function toProblemDetail(
    error: unknown,
    { logger, serviceName }: { logger: ApiLogger; serviceName: string },
): ProblemDetail {
    if (error instanceof ProblemDetailError) {
        return error.problemDetail;
    }
    if (isApiError(error)) {
        const { request, kind, status, requestId, problem } = error;
        const message = `${serviceName} ${request} ${kind} ${status ?? '-'} ${requestId ?? '-'}: ${error.message}`;
        if (kind === 'http' && !error.retryable) {
            logger.info(message);
        } else {
            logger.error(error.cause ? `${message}: ${error.cause.message}` : message);
        }
        return (
            problem ?? {
                type: 'about:blank',
                title: error.message,
                status: status ?? 0,
                detail: `${error.message} (${serviceName}: ${request})`,
                instance: request,
            }
        );
    }
    logger.error(`Unknown error when calling ${serviceName}: ${String(error)}`);
    return {
        type: 'about:blank',
        title: error instanceof Error ? error.message : 'Unknown error',
        status: 0,
        detail: `Unknown error from ${serviceName}`,
        instance: 'unknown path',
    };
}
