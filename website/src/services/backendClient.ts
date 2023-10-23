import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError } from 'axios';
import { type Err, err, ok } from 'neverthrow';

import { backendApi } from './backendApi.ts';
import { problemDetail, type ProblemDetail } from '../types.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = keyof ZodiosAliases<Api>;

type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    parameters: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};

type TypeThatCanBeUsedAsArgs = [any, any];

export abstract class BackendClient {
    public readonly zodios: ZodiosInstance<typeof backendApi>;

    protected constructor(backendUrl: string) {
        this.zodios = new Zodios(backendUrl, backendApi);
    }

    public call<Method extends ZodiosMethods<typeof backendApi>>(
        method: Method,
        ...args: ZodiosMethod<typeof backendApi, Method>['parameters']
    ) {
        const zodiosResponse = this.zodios[method](...(args as TypeThatCanBeUsedAsArgs)) as ZodiosMethod<
            typeof backendApi,
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
                problemDetailResponse = problemDetail.parse(error.response.data);
            } catch (e) {
                await this.logError('Unknown error from backend: ' + JSON.stringify(error.response.data));
                return {
                    type: 'about:blank',
                    title: error.message,
                    status: 0,
                    detail: 'Unknown error from backend',
                    instance: method,
                };
            }

            await this.logInfo(`${message}: ${problemDetailResponse.detail}`);
            return problemDetailResponse;
        }

        await this.logError('Unknown error from backend: ' + JSON.stringify(error));
        return {
            type: 'about:blank',
            title: error.message,
            status: 0,
            detail: 'Unknown error from backend',
            instance: method,
        };
    }

    protected abstract logError(message: string): Promise<void>;

    protected abstract logInfo(message: string): Promise<void>;
}
