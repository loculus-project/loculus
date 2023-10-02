import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type FC } from 'react';

// eslint-disable-next-line
const withQueryProvider = (WrappedComponent: FC<any>) => {
    return (props: any) => {
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
};

export default withQueryProvider;
