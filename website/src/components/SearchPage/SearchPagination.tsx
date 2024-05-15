import MUIPagination from '@mui/material/Pagination';
import type { FC } from 'react';

import { navigateToSearchLikePage, type ClassOfSearchPageType } from '../../routes/routes';
import type { AccessionFilter, MetadataFilter, MutationFilter } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';

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
            onChange={(_, newPage) => setPage(newPage)}
            color='primary'
            variant='outlined'
            shape='rounded'
        />
    );
};
