import { type AxiosError, isAxiosError } from 'axios';
import { err, ok, type Result } from 'neverthrow';
import type { z } from 'zod';

import { type ApiRequest, ResponseValidationError, sendRequest } from './apiRequest.ts';
import { problemDetail, type ProblemDetail } from '../types/backend.ts';

/**
 * The subset of a logger that `ApiClient` needs.
 * Satisfied by both the server-side `InstanceLogger` and the browser `ClientLogger`.
 */
export type ApiClientLogger = {
    error: (message: string) => unknown;
    info: (message: string) => unknown;
};

export type ApiClientRequest = Omit<ApiRequest, 'path'> & {
    /** A function is evaluated inside the error handling, so a failure to build the path becomes an `Err` */
    path: string | (() => string);
};

/**
 * Base class for API clients. Requests return a neverthrow `Result` instead of throwing.
 */
export class ApiClient {
    protected constructor(
        protected readonly baseUrl: string,
        /** Extracts the (unvalidated) problem detail from an error response body */
        private readonly tryToExtractProblemDetail: (responseData: unknown) => unknown,
        private readonly logger: ApiClientLogger,
        private readonly serviceName: string,
    ) {}

    /**
     * Pass `path` as a function (e.g. `path: () => apiPath\`/x/${id}\``) when building it can throw,
     * so that the error is returned as an `Err` instead of being thrown.
     */
    protected async request<T>(
        request: ApiClientRequest & { responseSchema: z.ZodType<T> },
    ): Promise<Result<T, ProblemDetail>> {
        let path: string | undefined;
        try {
            path = typeof request.path === 'function' ? request.path() : request.path;
            return ok(await sendRequest(this.baseUrl, { ...request, path }));
        } catch (error) {
            return err(this.toProblemDetail(error, path ?? 'unknown path'));
        }
    }

    private toProblemDetail(error: unknown, path: string): ProblemDetail {
        if (error instanceof ResponseValidationError) {
            this.logger.error(error.message);
            return {
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to parse ${this.serviceName} response: ${error.zodError.toString()}`,
                instance: path,
            };
        }
        if (isAxiosError(error)) {
            return this.createProblemDetail(error, path);
        }
        this.logger.error(`Unknown error when calling ${this.serviceName}: ${String(error)}`);
        return {
            type: 'about:blank',
            title: error instanceof Error ? error.message : 'Unknown error',
            status: 0,
            detail: `Unknown error from ${this.serviceName}`,
            instance: path,
        };
    }

    private createProblemDetail(error: AxiosError, path: string): ProblemDetail {
        if (error.response?.status === 401) {
            const message = error.response.headers['www-authenticate'] ?? 'Not authorized';
            return {
                type: 'about:blank',
                title: 'Not authorized',
                status: 401,
                detail: message,
                instance: path,
            };
        }

        const message = error.message;
        if (error.response !== undefined) {
            const requestId =
                error.response.headers['x-request-id'] !== undefined
                    ? `(request id ${error.response.headers['x-request-id']}) `
                    : '';

            const problemDetailResponse = problemDetail.safeParse(this.tryToExtractProblemDetail(error.response.data));
            if (!problemDetailResponse.success) {
                this.logger.error(
                    `Unknown error from ${this.serviceName} ${requestId}: ${JSON.stringify(error.response.data)}`,
                );
                return {
                    type: 'about:blank',
                    title: error.message,
                    status: error.response.status,
                    detail: `Unknown error from ${this.serviceName}`,
                    instance: path,
                };
            }

            this.logger.info(`${requestId}${message}: ${problemDetailResponse.data.detail}`);
            return problemDetailResponse.data;
        }

        this.logger.error(`Unknown error from ${this.serviceName}: ${JSON.stringify(error)}`);
        return {
            type: 'about:blank',
            title: error.message,
            status: 0,
            detail: `Unknown error from ${this.serviceName}`,
            instance: path,
        };
    }
}
