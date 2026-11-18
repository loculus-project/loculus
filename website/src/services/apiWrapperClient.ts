import type { AxiosError, AxiosResponse } from 'axios';
import { type Err, err, ok, type Result } from 'neverthrow';

import { ApiClient, type ApiDefinition, type ApiResponse, type RequestArgs } from './apiClient.ts';
import { type InstanceLogger } from '../logger.ts';
import { problemDetail, type ProblemDetail } from '../types/backend.ts';

/**
 * Wraps an ApiClient such that requests return a neverthrow Result instead of throwing.
 */
export class ApiWrapperClient<Api extends ApiDefinition> {
    public readonly client: ApiClient<Api>;

    protected constructor(
        url: string,
        api: Api,
        private readonly tryToExtractProblemDetail: (error: AxiosResponse) => ProblemDetail | undefined,
        private readonly logger: InstanceLogger,
        private readonly serviceName: string,
    ) {
        this.client = new ApiClient(url, api);
    }

    /**
     * @param alias The name of the endpoint as defined in the API definition
     * @param args Body, path params, queries and headers; it's best to ask TypeScript/your IDE for the available options
     */
    public async call<Alias extends keyof Api & string>(
        alias: Alias,
        args: RequestArgs<Api[Alias]>,
    ): Promise<Result<ApiResponse<Api[Alias]>, ProblemDetail>> {
        return this.client.request(alias, args).then(
            (response) => ok(response),
            (error: AxiosError): Err<never, ProblemDetail> => err(this.createProblemDetail(error, alias)), // eslint-disable-line @typescript-eslint/use-unknown-in-catch-callback-variable
        );
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
                problemDetailResponse = problemDetail.parse(this.tryToExtractProblemDetail(error.response));
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
