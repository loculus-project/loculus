import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type FC, type JSX, useContext, useState } from 'react';

import { isRetryable } from '../../services/apiRequest.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

export type ApiContext = { clientConfig: ClientConfig; accessToken?: string };

const apiContext = createContext<ApiContext | undefined>(undefined);

export function useApiContext(): ApiContext {
    const context = useContext(apiContext);
    if (context === undefined) {
        throw new Error('API hooks must be used in an island wrapped in withQueryProvider with a clientConfig prop');
    }
    return context;
}

/** Retry only what can succeed on a second attempt (see `isRetryable`), at most 3 times. */
export const retryOptions = {
    retry: (failureCount: number, error: unknown) => failureCount < 3 && isRetryable(error),
    retryDelay: (attemptIndex: number) => Math.min(250 * 2 ** attemptIndex, 30000),
};

/** Gives the island a QueryClient and, if it has a `clientConfig` prop, the context of the API hooks. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function withQueryProvider<Props>(WrappedComponent: FC<Props & JSX.IntrinsicAttributes>) {
    return (props: Props & Partial<ApiContext> & JSX.IntrinsicAttributes) => {
        // Created once per island: a new QueryClient on every render would empty the cache
        const [queryClient] = useState(
            () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, ...retryOptions } } }),
        );
        const { clientConfig, accessToken } = props;
        const outerContext = useContext(apiContext);
        return (
            <QueryClientProvider client={queryClient}>
                <apiContext.Provider
                    value={
                        clientConfig
                            ? { clientConfig, accessToken: accessToken ?? outerContext?.accessToken }
                            : outerContext
                    }
                >
                    <WrappedComponent {...props} />
                </apiContext.Provider>
            </QueryClientProvider>
        );
    };
}
