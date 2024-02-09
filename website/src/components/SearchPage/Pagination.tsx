import { Pagination as MUIPagination } from '@mui/material';
import type { FC } from 'react';

import { navigateToSearchPage } from '../../routes';
import type { MetadataFilter, MutationFilter, Schema } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';


type Props = {
    count: number;
    metadataFilter: MetadataFilter[];
    mutationFilter: MutationFilter;
    orderBy: OrderBy;
    organism: string;
    page: number;
};

export const Pagination: FC<Props> = ({ count, metadataFilter, mutationFilter, orderBy, organism, page }) => {
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
