import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError } from 'axios';
import { type Err, err, ok } from 'neverthrow';

import { backendApi } from './backendApi.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { problemDetail, type ProblemDetail } from '../types.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = keyof ZodiosAliases<Api>;

type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    parameters: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};

type TypeThatCanBeUsedAsArgs = [any, any];

export class BackendClient {
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

    constructor(
        backendUrl: string,
        private readonly logger: ReturnType<typeof getInstanceLogger>,
    ) {
        this.zodios = new Zodios(backendUrl, backendApi);
    }

    public static create() {
        return new BackendClient(getRuntimeConfig().forServer.backendUrl, getInstanceLogger('serverSideBackendClient'));
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
                this.logger.error('Unknown error from backend: ' + JSON.stringify(error.response.data));
                return {
                    type: 'about:blank',
                    title: error.message,
                    status: 0,
                    detail: 'Unknown error from backend',
                    instance: method,
                };
            }

            this.logger.info(`${message}: ${problemDetailResponse.detail}`);
            return problemDetailResponse;
        }

        this.logger.error('Unknown error from backend: ' + JSON.stringify(error));
        return {
            type: 'about:blank',
            title: error.message,
            status: 0,
            detail: 'Unknown error from backend',
            instance: method,
        };
    }
}
