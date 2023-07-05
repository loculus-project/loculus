import React, { useEffect, useState } from 'react';

import { fetchSequenceList } from '../api';
import type { Config } from '../config';

type Props = {
    config: Config;
};

export const PaginatedSequenceList = ({ config }: Props): React.JSX.Element => {
    const [page, setPage] = useState(0);
    const [sequences, setSequences] = useState<any[] | undefined>();
    const offset = 100 * page;

    useEffect(() => {
        (async () => {
            const list = await fetchSequenceList(config);
            setSequences(list);
        })().catch(() => new Error('Error fetching sequences'));
    }, [config]);

    if (!sequences) {
        return <>Loading..</>;
    }

    return (
        <div>
            <button onClick={() => setPage(Math.max(page - 1, 0))} className='mr-2'>
                Previous
            </button>
            <button onClick={() => setPage(page + 1)}>Next</button>
            <ul>
                {sequences.slice(offset, offset + 100).map((d) => (
                    <li key={d[config.schema.primaryKey]}>
                        <a href={`/sequences/${d[config.schema.primaryKey]}`}>{d[config.schema.primaryKey]}</a>
                    </li>
                ))}
            </ul>
        </div>
    );
};
