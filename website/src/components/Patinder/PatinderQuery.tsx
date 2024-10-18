import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { PatinderQueryForm } from './PatinderQueryForm.tsx';
import { PatinderResult } from './PatinderResult.tsx';

const queryClient = new QueryClient();

export const PatinderQuery = ({}) => {
    const [query, setQuery] = useState<string>('');
    const queryHashes = new Set(
        query
            .split(',')
            .map((h) => h.trim())
            .filter((h) => h.length > 0),
    );

    return (
        <>
            <h2 className='font-semibold my-3 text-lg'>Query hash profile</h2>
            <div>
                You can find similar sequences to yours by querying the hash profile. You can use the form below or
                download our{' '}
                <a href='https://github.com/microbio-hackathon-2024/pathinder-client/tree/main/query' class='underline'>
                    command line interface (CLI) program
                </a>
            </div>
            <PatinderQueryForm setQuery={setQuery} />
            <QueryClientProvider client={queryClient}>
                <PatinderResult queryHashes={queryHashes} minProportionMatched={0.95} />
            </QueryClientProvider>
        </>
    );
};
