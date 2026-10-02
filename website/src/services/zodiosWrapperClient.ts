import { Zodios, type ZodiosEndpointDefinitions, type ZodiosInstance } from '@zodios/core';
import type { Narrow } from '@zodios/core/lib/utils.types';
import type { Aliases, ZodiosAliases } from '@zodios/core/lib/zodios.types';
import type { AxiosError, AxiosResponse } from 'axios';
import { type Err, err, ok, type Result } from 'neverthrow';

import { type InstanceLogger } from '../logger.ts';
import { problemDetail, type ProblemDetail } from '../types/backend.ts';
import { formatErrorMessage } from '../utils/formatErrorMessage.ts';

type ZodiosMethods<Api extends ZodiosEndpointDefinitions> = Aliases<Api>;

/* eslint-disable @typescript-eslint/no-generated-empty-object-type --
 * `ZodiosAliases<Api>` is a mapped type over the still-unresolved type parameter `Api`, so it has no
 * members yet and appears as `{}` to the linter. It resolves to the actual aliases once `Api` is
 * instantiated with a concrete set of endpoint definitions. */
type ZodiosMethod<Api extends ZodiosEndpointDefinitions, Method extends ZodiosMethods<Api>> = {
    parameters: Parameters<ZodiosAliases<Api>[Method]>;
    response: ReturnType<ZodiosAliases<Api>[Method]>;
};
/* eslint-enable @typescript-eslint/no-generated-empty-object-type */

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
        // eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- see the note on ZodiosMethod above
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

        // Deliberately not asProblemDetail: a body this client cannot parse is reported as coming
        // from the service rather than surfaced raw, so the fallback wording differs.
        const unknownError = {
            type: 'about:blank',
            title: error.message,
            status: 0,
            detail: `Unknown error from ${this.serviceName}`,
            instance: method,
        };

        if (error.response === undefined) {
            this.logger.error(`Unknown error from ${this.serviceName}: ${formatErrorMessage(error)}`);
            return unknownError;
        }

        const requestId =
            error.response.headers['x-request-id'] !== undefined
                ? `(request id ${error.response.headers['x-request-id']}) `
                : '';

        const parsed = problemDetail.safeParse(this.tryToExtractProblemDetail(error.response));
        if (!parsed.success) {
            this.logger.error(`Unknown error from ${this.serviceName} ${requestId}: ${formatErrorMessage(error)}`);
            return unknownError;
        }

        this.logger.info(`${requestId}${error.message}: ${parsed.data.detail}`);
        return parsed.data;
    }
}
