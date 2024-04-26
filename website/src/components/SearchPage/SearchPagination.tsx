import MUIPagination from '@mui/material/Pagination';
import type { FC } from 'react';

import { navigateToSearchLikePage, type ClassOfSearchPageType } from '../../routes/routes';
import type { AccessionFilter, MetadataFilter, MutationFilter, GroupedMetadataFilter } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';

type SearchPaginationProps = {
    count: number;
    metadataFilter: MetadataFilter[];
    unflattenedMetadataFilter: ((MetadataFilter | GroupedMetadataFilter) & { label: string })[];
    accessionFilter: AccessionFilter;
    mutationFilter: MutationFilter;
    orderBy: OrderBy;
    organism: string;
    page: number;
    classOfSearchPage: ClassOfSearchPageType;
    groupId?: number;
};

export const SearchPagination: FC<SearchPaginationProps> = ({
    count,
    metadataFilter,
    unflattenedMetadataFilter,
    accessionFilter,
    mutationFilter,
    orderBy,
    organism,
    page,
    classOfSearchPage,
    groupId,
}) => {
    return (
        <MUIPagination
            count={count}
            page={page}
            onChange={(_, newPage) => {
                navigateToSearchLikePage(
                    organism,
                    classOfSearchPage,
                    groupId,
                    metadataFilter,
                    unflattenedMetadataFilter,
                    accessionFilter,
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
