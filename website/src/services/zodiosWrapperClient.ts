import axios, { type AxiosError, type AxiosRequestConfig, type Method } from 'axios';
import { err, ok, type Result } from 'neverthrow';
import type z from 'zod';

import { type InstanceLogger } from '../logger.ts';
import { problemDetail, type ProblemDetail } from '../types/backend.ts';

export class ApiClient {
    protected constructor(
        protected readonly baseUrl: string,
        private readonly tryToExtractProblemDetail: (data: unknown) => ProblemDetail | undefined,
        private readonly logger: InstanceLogger,
        private readonly serviceName: string,
    ) {}

    protected async request<T>(
        method: Method,
        path: string,
        responseSchema: z.ZodType<T>,
        config?: AxiosRequestConfig,
    ): Promise<Result<T, ProblemDetail>> {
        try {
            const response = await axios.request({
                url: `${this.baseUrl}${path}`,
                method,
                ...config,
            });

            const parseResult = responseSchema.safeParse(response.data);
            if (parseResult.success) {
                return ok(parseResult.data);
            }
            return err({
                type: 'about:blank',
                title: 'bad response',
                status: 0,
                detail: `Failed to parse ${this.serviceName} response: ${parseResult.error.toString()}`,
                instance: path,
            });
        } catch (e) {
            const axiosError = e as AxiosError;
            return err(this.createProblemDetail(axiosError, path));
        }
    }

    protected createProblemDetail(error: AxiosError, method: string): ProblemDetail {
        if (error.response?.status === 401) {
            const message = error.response.headers['www-authenticate'] ?? 'Not authorized';
            return {
                type: 'about:blank',
                title: 'Not authorized',
                status: 401,
                detail: message,
                instance: method,
            };
        }

        const message = error.message;
        if (error.response !== undefined) {
            const requestId =
                error.response.headers['x-request-id'] !== undefined
                    ? `(request id ${error.response.headers['x-request-id']}) `
                    : '';

            let problemDetailResponse;
            try {
                problemDetailResponse = problemDetail.parse(this.tryToExtractProblemDetail(error.response.data));
            } catch (_) {
                this.logger.error(
                    `Unknown error from ${this.serviceName} ${requestId}: ${JSON.stringify(error.response.data)}`,
                );
                return {
                    type: 'about:blank',
                    title: error.message,
                    status: 0,
                    detail: `Unknown error from ${this.serviceName}`,
                    instance: method,
                };
            }

            this.logger.info(`${requestId}${message}: ${problemDetailResponse.detail}`);
            return problemDetailResponse;
        }

        this.logger.error(`Unknown error from ${this.serviceName}: ${JSON.stringify(error)}`);
        return {
            type: 'about:blank',
            title: error.message,
            status: 0,
            detail: `Unknown error from ${this.serviceName}`,
            instance: method,
        };
    }
}
