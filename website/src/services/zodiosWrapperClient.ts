import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance, type ZodiosPlugin } from '@zodios/core';
import type { Narrow } from '@zodios/core/lib/utils.types';
import type { Aliases, ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError, AxiosResponse } from 'axios';
import { type Err, err, ok, type Result } from 'neverthrow';
import type { ZodError } from 'zod';

import { type InstanceLogger } from '../logger.ts';
import { problemDetail, type ProblemDetail } from '../types/backend.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = Aliases<Api>;

type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    parameters: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};

class ResponseValidationError extends Error {
    constructor(
        endpoint: string,
        public readonly zodError: ZodError,
    ) {
        super(`Invalid response from endpoint '${endpoint}'`);
    }
}

/**
 * Validates JSON responses against the endpoint's schema like zodios' own validation, but with zod's
 * synchronous parse: zodios uses safeParseAsync, which costs several times the time and memory on large bodies.
 */
const syncResponseValidation: ZodiosPlugin = {
    name: 'sync-response-validation',
    // eslint-disable-next-line @typescript-eslint/require-await -- zodios plugins have to return a promise
    response: async (api, config, response) => {
        const endpoint = api.find((it) => it.method === config.method && it.path === config.url);
        if (endpoint === undefined) {
            throw new Error(`No endpoint found for ${config.method} ${config.url}`);
        }
        const contentType: unknown = response.headers['content-type'];
        if (typeof contentType === 'string' && contentType.includes('application/json')) {
            const parsed = endpoint.response.safeParse(response.data);
            if (!parsed.success) {
                throw new ResponseValidationError(`${endpoint.method} ${endpoint.path}`, parsed.error);
            }
            response.data = parsed.data;
        }
        return response;
    },
};

type TypeThatCanBeUsedAsArgs = [any, any]; // eslint-disable-line @typescript-eslint/no-explicit-any -- unfortunately, TS doesn't properly infer the correct types, so we have to use this workaround

export class ZodiosWrapperClient<Api extends ZodiosEndpointDefinitions> {
    public readonly zodios: ZodiosInstance<Api>;

    protected constructor(
        url: string,
        api: Narrow<Api>,
        private readonly tryToExtractProblemDetail: (error: AxiosResponse) => ProblemDetail | undefined,
        private readonly logger: InstanceLogger,
        private readonly serviceName: string,
    ) {
        // Zodios validates with zod's safeParseAsync, which for large bodies (e.g. tens of thousands
        // of accessions in a SeqSet) takes hundreds of MiB and blocks the server's event loop for
        // seconds, so its validation is off and responses are validated synchronously instead.
        // Request parameters are not run through their schemas here (so no zod transforms or defaults on
        // them): they are typed, and the backend and LAPIS validate them.
        // See https://github.com/loculus-project/loculus/issues/7752
        this.zodios = new Zodios(url, api, { validate: false });
        this.zodios.use(syncResponseValidation);
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
            (error: AxiosError): Err<never, ProblemDetail> => err(this.createProblemDetail(error, method)), // eslint-disable-line @typescript-eslint/use-unknown-in-catch-callback-variable
        );
    }

    protected createProblemDetail(error: AxiosError, method: string): ProblemDetail {
        if (error instanceof ResponseValidationError) {
            this.logger.error(`${error.message} of ${this.serviceName}: ${error.zodError.message.slice(0, 2000)}`);
            return {
                type: 'about:blank',
                title: error.message,
                status: 0,
                detail: `Unexpected response format from ${this.serviceName}`,
                instance: method,
            };
        }

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
