import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type FC, type JSX, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/naming-convention
export function withQueryProvider<Props>(WrappedComponent: FC<Props & JSX.IntrinsicAttributes>) {
    return (props: Props & JSX.IntrinsicAttributes) => {
        // Create the client lazily once and keep it stable across re-renders, otherwise a new
        // QueryClient (and thus an empty cache) would be created on every render.
        const [queryClient] = useState(
            () =>
                new QueryClient({
                    defaultOptions: {
                        queries: {
                            refetchOnWindowFocus: false,
                        },
                    },
                }),
        );
        return (
            <QueryClientProvider client={queryClient}>
                <WrappedComponent {...props} />
            </QueryClientProvider>
        );
    };
}
