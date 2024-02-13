import { Pagination as MUIPagination } from '@mui/material';
import type { FC } from 'react';

import { navigateToSearchPage } from '../../routes';
import type { MetadataFilter, MutationFilter } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';

type SearchPaginationProps = {
    count: number;
    metadataFilter: MetadataFilter[];
    mutationFilter: MutationFilter;
    orderBy: OrderBy;
    organism: string;
    page: number;
};

export const SearchPagination: FC<SearchPaginationProps> = ({
    count,
    metadataFilter,
    mutationFilter,
    orderBy,
    organism,
    page,
}) => {
    return (
        <MUIPagination
            count={count}
            page={page}
            onChange={(_, newPage) => {
                navigateToSearchPage(organism, metadataFilter, mutationFilter, newPage, orderBy);
            }}
            color='primary'
            variant='outlined'
            shape='rounded'
        />
    );
};
