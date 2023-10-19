import { err, ok } from 'neverthrow';
import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { AxiosError } from 'axios';
import type { ZodiosAliases } from '@zodios/core/lib/zodios.types';
import { backendApi } from './backendApi.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = keyof ZodiosAliases<Api>;

type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    args: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};

export abstract class BackendClient {
    public readonly zodios: ZodiosInstance<typeof backendApi>;

    protected constructor(backendUrl: string) {
        this.zodios = new Zodios(backendUrl, backendApi);
    }

    public call<Method extends ZodiosMethods<typeof backendApi>>(
        method: Method,
        ...args: ZodiosMethod<typeof backendApi, Method>['args']
    ) {
        let zodiosResponse = this.zodios[method](...(args as [any, any])) as ZodiosMethod<
            typeof backendApi,
            Method
        >['response'];

        return zodiosResponse.then(
            (response) => {
                return ok(response);
            },
            async (error: AxiosError) => {
                await this.logError(JSON.stringify(error));
                return err(error);
            },
        );
    }

    /** Somehow Typescript's type inference currently doesn't work properly in Astro files */
    public astroFileTypeHelpers = {
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

    protected abstract logError(message: string): Promise<void>;
}
