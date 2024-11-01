import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { Narrow } from '@zodios/core/lib/utils.types';
import type { Aliases, ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError, AxiosResponse } from 'axios';
import { type Err, err, ok, type Result } from 'neverthrow';

import { type InstanceLogger } from '../logger.ts';
import { problemDetail, type ProblemDetail } from '../types/backend.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = Aliases<Api>;

type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    parameters: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};

type TypeThatCanBeUsedAsArgs = [any, any];

export class ZodiosWrapperClient<Api extends ZodiosEndpointDefinitions> {
    public readonly zodios: ZodiosInstance<Api>;

    protected constructor(
        url: string,
        api: Narrow<Api>,
        private readonly tryToExtractProblemDetail: (error: AxiosResponse) => ProblemDetail | undefined,
        private readonly logger: InstanceLogger,
        private readonly serviceName: string,
    ) {
        this.zodios = new Zodios(url, api);
    }

    /**
     *
     * @param method An alias as defined in makeEndpoint()
     * @param args Arguments such as params and headers; it's best to ask TypeScript/your IDE for the available options
     */
    public async call<Method extends ZodiosMethods<Api>>(
        method: Method,
        ...args: ZodiosMethod<Api, Method>['parameters']
    ): Promise<Result<Awaited<ZodiosMethod<Api, Method>['response']>, ProblemDetail>> {
        const zodiosMethod = this.zodios[method] as ZodiosAliases<Api>[Method];
        const zodiosResponse = zodiosMethod(...(args as TypeThatCanBeUsedAsArgs)) as ZodiosMethod<
            Api,
            Method
        >['response'];

        return zodiosResponse.then(
            (response) => ok(response),
            async (error: AxiosError): Promise<Err<never, ProblemDetail>> =>
                err(this.createProblemDetail(error, method)),
        );
    }

    private createProblemDetail(error: AxiosError, method: string): ProblemDetail {
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
            } catch (e) {
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

    public async getProcessedSequencesCount(): Promise<Result<Record<string, number>, ProblemDetail>> {
        return this.call('getProcessedSequencesCount');
    }
}
