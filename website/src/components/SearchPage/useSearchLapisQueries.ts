import { useEffect, useState } from 'react';

import type { TableSequenceData } from './Table';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { pageSize } from '../../settings';
import type { OrderBy, OrderDirection } from '../../types/lapis.ts';

type LapisHooks = ReturnType<typeof lapisClientHooks>['zodiosHooks'];
type AggregatedHook = ReturnType<LapisHooks['useAggregated']>;
type DetailsHook = ReturnType<LapisHooks['useDetails']>;

export interface SearchLapisQueriesHook {
    aggregatedHook: AggregatedHook;
    detailsHook: DetailsHook;
    totalSequences: number | undefined;
    oldData: TableSequenceData[] | null;
    oldCount: number | null;
    firstClientSideLoadOfDataCompleted: boolean;
    firstClientSideLoadOfCountCompleted: boolean;
}

export function useSearchLapisQueries(
    lapisUrl: string,
    lapisSearchParameters: Record<string, unknown>,
    columnsToShow: string[],
    primaryKey: string,
    page: number,
    orderByField: string,
    orderDirection: OrderDirection,
): SearchLapisQueriesHook {
    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const aggregatedHook = hooks.useAggregated({}, {});
    const detailsHook = hooks.useDetails({}, {});

    const [oldData, setOldData] = useState<TableSequenceData[] | null>(null);
    const [oldCount, setOldCount] = useState<number | null>(null);
    const [firstClientSideLoadOfDataCompleted, setFirstClientSideLoadOfDataCompleted] = useState(false);
    const [firstClientSideLoadOfCountCompleted, setFirstClientSideLoadOfCountCompleted] = useState(false);

    useEffect(() => {
        aggregatedHook.mutate({
            ...lapisSearchParameters,
            fields: [],
        });
        const OrderByList: OrderBy[] = [
            {
                field: orderByField,
                type: orderDirection,
            },
        ];
        // @ts-expect-error because the hooks don't accept OrderBy type correctly
        detailsHook.mutate({
            ...lapisSearchParameters,
            fields: [...columnsToShow, primaryKey],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: OrderByList,
        });
    }, [lapisSearchParameters, columnsToShow, primaryKey, pageSize, page, orderByField, orderDirection]);

    useEffect(() => {
        if (detailsHook.data?.data && oldData !== detailsHook.data.data) {
            setOldData(detailsHook.data.data);
            setFirstClientSideLoadOfDataCompleted(true);
        }
    }, [detailsHook.data?.data, oldData]);

    useEffect(() => {
        if (aggregatedHook.data?.data && oldCount !== aggregatedHook.data.data[0].count) {
            setOldCount(aggregatedHook.data.data[0].count);
            setFirstClientSideLoadOfCountCompleted(true);
        }
    }, [aggregatedHook.data?.data, oldCount]);

    const totalSequences = aggregatedHook.data?.data[0].count ?? undefined;

    return {
        aggregatedHook,
        detailsHook,
        totalSequences,
        oldData,
        oldCount,
        firstClientSideLoadOfDataCompleted,
        firstClientSideLoadOfCountCompleted,
    };
}
