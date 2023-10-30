import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { Narrow } from '@zodios/core/lib/utils.types';
import type { Aliases, ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError, AxiosResponse } from 'axios';
import { type Err, err, ok } from 'neverthrow';

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
        backendUrl: string,
        api: Narrow<Api>,
        private readonly tryToExtractProblemDetail: (error: AxiosResponse) => ProblemDetail | undefined,
        private readonly logger: InstanceLogger,
        private readonly serviceName: string,
    ) {
        this.zodios = new Zodios(backendUrl, api);
    }

    public call<Method extends ZodiosMethods<Api>>(method: Method, ...args: ZodiosMethod<Api, Method>['parameters']) {
        const zodiosMethod = this.zodios[method] as ZodiosAliases<Api>[Method];
        const zodiosResponse = zodiosMethod(...(args as TypeThatCanBeUsedAsArgs)) as ZodiosMethod<
            Api,
            Method
        >['response'];

        return zodiosResponse.then(
            (response) => ok(response),
            async (error: AxiosError): Promise<Err<never, ProblemDetail>> =>
                err(await this.createProblemDetail(error, method)),
        );
    }

    private async createProblemDetail(error: AxiosError, method: string): Promise<ProblemDetail> {
        const message = error.message;
        if (error.response !== undefined) {
            let problemDetailResponse;
            try {
                problemDetailResponse = problemDetail.parse(this.tryToExtractProblemDetail(error.response));
            } catch (e) {
                this.logger.error(`Unknown error from ${this.serviceName}: ${JSON.stringify(error.response.data)}`);
                return {
                    type: 'about:blank',
                    title: error.message,
                    status: 0,
                    detail: `Unknown error from ${this.serviceName}`,
                    instance: method,
                };
            }

            this.logger.info(`${message}: ${problemDetailResponse.detail}`);
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
