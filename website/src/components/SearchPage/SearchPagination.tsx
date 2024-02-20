import { Pagination as MUIPagination } from '@mui/material';
import type { FC } from 'react';

import { navigateToSearchLikePage, type ClassOfSearchPageType } from '../../routes';
import type { MetadataFilter, MutationFilter } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';

type SearchPaginationProps = {
    count: number;
    metadataFilter: MetadataFilter[];
    mutationFilter: MutationFilter;
    orderBy: OrderBy;
    organism: string;
    page: number;
    classOfSearchPage: ClassOfSearchPageType;
    group?: string;
};

export const SearchPagination: FC<SearchPaginationProps> = ({
    count,
    metadataFilter,
    mutationFilter,
    orderBy,
    organism,
    page,
    classOfSearchPage,
    group,
}) => {
    return (
        <MUIPagination
            count={count}
            page={page}
            onChange={(_, newPage) => {
                navigateToSearchLikePage(
                    organism,
                    classOfSearchPage,
                    group,
                    metadataFilter,
                    mutationFilter,
                    newPage,
                    orderBy,
                );
            }}
            color='primary'
            variant='outlined'
            shape='rounded'
        />
    );
};
