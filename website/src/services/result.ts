import { type AxiosError, isAxiosError } from 'axios';
import { err, ok, type Result } from 'neverthrow';

import { extractProblemDetail, ResponseValidationError } from './apiRequest.ts';
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
    if (error instanceof ResponseValidationError) {
        logger.error(error.message);
        return {
            type: 'about:blank',
            title: 'bad response',
            status: 0,
            detail: `Failed to parse ${serviceName} response: ${error.zodError.toString()}`,
            instance: error.request,
        };
    }
    if (isAxiosError(error)) {
        return axiosErrorToProblemDetail(error, { logger, serviceName });
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

function axiosErrorToProblemDetail(
    error: AxiosError,
    { logger, serviceName }: { logger: ApiLogger; serviceName: string },
): ProblemDetail {
    const path = error.config?.url ?? 'unknown path';

    if (error.response === undefined) {
        logger.error(`Unknown error from ${serviceName}: ${JSON.stringify(error)}`);
        return {
            type: 'about:blank',
            title: error.message,
            status: 0,
            detail: `Unknown error from ${serviceName}`,
            instance: path,
        };
    }

    if (error.response.status === 401) {
        return {
            type: 'about:blank',
            title: 'Not authorized',
            status: 401,
            detail: (error.response.headers['www-authenticate'] as string | undefined) ?? 'Not authorized',
            instance: path,
        };
    }

    const requestIdHeader = error.response.headers['x-request-id'] as string | undefined;
    const requestId = requestIdHeader !== undefined ? `(request id ${requestIdHeader}) ` : '';

    const problemDetail = extractProblemDetail(error);
    if (problemDetail === undefined) {
        logger.error(`Unknown error from ${serviceName} ${requestId}: ${JSON.stringify(error.response.data)}`);
        return {
            type: 'about:blank',
            title: error.message,
            status: error.response.status,
            detail: `Unknown error from ${serviceName}`,
            instance: path,
        };
    }

    logger.info(`${requestId}${error.message}: ${problemDetail.detail}`);
    return problemDetail;
}
