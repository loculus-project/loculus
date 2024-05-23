import MUIPagination from '@mui/material/Pagination';
import type { FC } from 'react';

type SearchPaginationProps = {
    count: number;
    page: number;
    setPage: (page: number) => void;
};

export const SearchPagination: FC<SearchPaginationProps> = ({
    count,

    page,
    setPage,
}) => {
    return (
        <MUIPagination
            count={count}
            page={page}
            onChange={(_, newPage) => {
                setPage(newPage);
                window.scrollTo({ top: 0 });
            }}
            color='primary'
            variant='outlined'
            shape='rounded'
        />
    );
};
