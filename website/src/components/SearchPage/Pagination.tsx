import { Pagination as MUIPagination } from '@mui/material';
import type { FC } from 'react';

type Props = {
    count: number;
};

export const Pagination: FC<Props> = ({ count }) => {
    const params = new URLSearchParams(location.search);
    const pageParam = params.get('page');
    const page = pageParam !== null ? Number.parseInt(pageParam, 10) : 1;

    return (
        <MUIPagination
            count={count}
            page={page}
            onChange={(_, newPage) => {
                params.set('page', newPage.toString());
                location.href = `search?${params}`;
            }}
            color='primary'
            variant='outlined'
            shape='rounded'
        />
    );
};
