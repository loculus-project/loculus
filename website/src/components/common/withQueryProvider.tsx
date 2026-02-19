import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FC, JSX } from 'react';

// eslint-disable-next-line @typescript-eslint/naming-convention
export function withQueryProvider<Props>(WrappedComponent: FC<Props & JSX.IntrinsicAttributes>) {
    return (props: Props & JSX.IntrinsicAttributes) => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    refetchOnWindowFocus: false,
                },
            },
        });
        return (
            <QueryClientProvider client={queryClient}>
                <WrappedComponent {...props} />
            </QueryClientProvider>
        );
    };
}
