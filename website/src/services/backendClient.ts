import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError } from 'axios';
import { type Err, err, ok } from 'neverthrow';

import { backendApi } from './backendApi.ts';
import { problemDetail, type ProblemDetail } from '../types.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = keyof ZodiosAliases<Api>;

type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    args: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};

export abstract class BackendClient {
    public readonly zodios: ZodiosInstance<typeof backendApi>;

    /** Somehow Typescript's type inference currently doesn't work properly in Astro files */
    public readonly astroFileTypeHelpers = {
        getSequencesOfUser: (username: string) =>
            this.call('getSequencesOfUser', {
                queries: { username },
            }),

        getDataToReview: (username: string, sequenceId: string | number, version: string | number) =>
            this.call('getDataToReview', {
                params: { sequenceId, version },
                queries: { username },
            }),
    };

    protected constructor(backendUrl: string) {
        this.zodios = new Zodios(backendUrl, backendApi);
    }

    public call<Method extends ZodiosMethods<typeof backendApi>>(
        method: Method,
        ...args: ZodiosMethod<typeof backendApi, Method>['args']
    ) {
        const zodiosResponse = this.zodios[method](...(args as [any, any])) as ZodiosMethod<
            typeof backendApi,
            Method
        >['response'];

        return zodiosResponse.then(
            (response) => {
                return ok(response);
            },
            async (error: AxiosError): Promise<Err<never, ProblemDetail>> => {
                const message = error.message;
                if (error.response !== undefined) {
                    const problemDetailResponse = problemDetail.parse(error.response.data);

                    await this.logInfo(`${message}: ${problemDetailResponse.detail}`);
                    return err(problemDetailResponse);
                }

                await this.logError('Unknown error from backend: ' + JSON.stringify(error));
                return err({
                    type: 'about:blank',
                    title: error.message,
                    status: 0,
                    detail: 'Unknown error from backend',
                    instance: method,
                });
            },
        );
    }

    protected abstract logError(message: string): Promise<void>;

    protected abstract logInfo(message: string): Promise<void>;
}
