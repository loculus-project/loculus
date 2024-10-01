import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { useEffect, useMemo, useState } from 'react';

import { CustomizeModal } from './CustomizeModal.tsx';
import { DownloadDialog } from './DownloadDialog/DownloadDialog.tsx';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table, type TableSequenceData } from './Table';
import useQueryAsState from './useQueryAsState.js';
import { getLapisUrl } from '../../config.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import {
    type MetadataFilter,
    type Schema,
    type GroupedMetadataFilter,
    type FieldValues,
    type SetAFieldValue,
} from '../../types/config.ts';
import { type OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import {
    getFieldValuesFromQuery,
    getColumnVisibilitiesFromQuery,
    getFieldVisibilitiesFromQuery,
    VISIBILITY_PREFIX,
    COLUMN_VISIBILITY_PREFIX,
    getLapisSearchParameters,
    getMetadataSchemaWithExpandedRanges,
} from '../../utils/search.ts';
import ErrorBox from '../common/ErrorBox.tsx';

interface InnerSearchFullUIProps {
    accessToken?: string;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    myGroups: Group[];
    organism: string;
    clientConfig: ClientConfig;
    schema: Schema;
    hiddenFieldValues?: FieldValues;
    initialData: TableSequenceData[];
    initialCount: number;
    initialQueryDict: QueryState;
}
interface QueryState {
    [key: string]: string;
}

export const InnerSearchFullUI = ({
    accessToken,
    referenceGenomesSequenceNames,
    myGroups,
    organism,
    clientConfig,
    schema,
    hiddenFieldValues,
    initialData,
    initialCount,
    initialQueryDict,
}: InnerSearchFullUIProps) => {
    if (!hiddenFieldValues) {
        hiddenFieldValues = {};
    }

    const metadataSchema = schema.metadata;

    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

    const metadataSchemaWithExpandedRanges = useMemo(() => {
        return getMetadataSchemaWithExpandedRanges(metadataSchema);
    }, [metadataSchema]);

    const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);
    const [previewHalfScreen, setPreviewHalfScreen] = useState(false);
    const [state, setState] = useQueryAsState(initialQueryDict);

    const searchVisibilities = useMemo(() => {
        return getFieldVisibilitiesFromQuery(schema, state);
    }, [schema, state]);

    const columnVisibilities = useMemo(() => {
        return getColumnVisibilitiesFromQuery(schema, state);
    }, [schema, state]);

    const columnsToShow = useMemo(() => {
        return schema.metadata
            .filter((field) => columnVisibilities.get(field.name) === true)
            .map((field) => field.name);
    }, [schema.metadata, columnVisibilities]);

    let orderByField = state.orderBy ?? schema.defaultOrderBy ?? schema.primaryKey;
    if (!columnsToShow.includes(orderByField)) {
        orderByField = schema.primaryKey;
    }

    const orderDirection = state.order ?? schema.defaultOrder ?? 'ascending';

    const page = parseInt(state.page ?? '1', 10);

    const setPage = (newPage: number) => {
        setState((prev: QueryState) => {
            if (newPage === 1) {
                const withoutPageSet = { ...prev };
                delete withoutPageSet.page;
                return withoutPageSet;
            } else {
                return {
                    ...prev,
                    page: newPage.toString(),
                };
            }
        });
    };

    const selectedSeqs = JSON.parse(state.selectedSeqs ?? '[]') as string[];

    const setSelectedSeqs = (newSelectedSeqs: string[]) => {
        setState((prev: QueryState) => {
            if (newSelectedSeqs.length === 0) {
                const withoutSelectedSeqs = { ...prev };
                delete withoutSelectedSeqs.selectedSeqs;
                return withoutSelectedSeqs;
            } else {
                return {
                    ...prev,
                    selectedSeqs: JSON.stringify(newSelectedSeqs),
                };
            }
        });
    };

    const setOrderByField = (field: string) => {
        setState((prev: QueryState) => ({
            ...prev,
            orderBy: field,
        }));
    };
    const setOrderDirection = (direction: string) => {
        setState((prev: QueryState) => ({
            ...prev,
            order: direction,
        }));
    };

    const fieldValues = useMemo(() => {
        return getFieldValuesFromQuery(state, hiddenFieldValues, schema);
    }, [state, hiddenFieldValues, schema]);

    const setAFieldValue: SetAFieldValue = (fieldName, value) => {
        setState((prev: any) => {
            const newState = {
                ...prev,
                [fieldName]: value,
            };
            if (value === '') {
                delete newState[fieldName];
            }
            return newState;
        });
        setPage(1);
    };

    const setASearchVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: any) => ({
            ...prev,
            [`${VISIBILITY_PREFIX}${fieldName}`]: visible ? 'true' : 'false',
        }));
        // if visible is false, we should also remove the field from the fieldValues
        if (!visible) {
            setAFieldValue(fieldName, '');
        }
    };

    const setAColumnVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: any) => ({
            ...prev,
            [`${COLUMN_VISIBILITY_PREFIX}${fieldName}`]: visible ? 'true' : 'false',
        }));
    };

    const lapisUrl = getLapisUrl(clientConfig, organism);

    const consolidatedMetadataSchema = consolidateGroupedFields(metadataSchemaWithExpandedRanges);

    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const aggregatedHook = hooks.useAggregated({}, {});
    const detailsHook = hooks.useDetails({}, {});

    const lapisSearchParameters = useMemo(() => {
        return getLapisSearchParameters(fieldValues, referenceGenomesSequenceNames, schema);
    }, [fieldValues, referenceGenomesSequenceNames, schema]);

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
        // @ts-expect-error because the hooks don't accept OrderBy
        detailsHook.mutate({
            ...lapisSearchParameters,
            fields: [...columnsToShow, schema.primaryKey],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: OrderByList,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lapisSearchParameters, schema.tableColumns, schema.primaryKey, pageSize, page, orderByField, orderDirection]);

    const totalSequences = aggregatedHook.data?.data[0].count ?? undefined;

    const [oldData, setOldData] = useState<TableSequenceData[] | null>(null);
    const [oldCount, setOldCount] = useState<number | null>(null);
    const [firstClientSideLoadOfDataCompleted, setFirstClientSideLoadOfDataCompleted] = useState(false);
    const [firstClientSideLoadOfCountCompleted, setFirstClientSideLoadOfCountCompleted] = useState(false);

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

    return (
        <div className='flex flex-col md:flex-row gap-8 md:gap-4'>
            <CustomizeModal
                thingToCustomize='column'
                isCustomizeModalOpen={isColumnModalOpen}
                toggleCustomizeModal={() => setIsColumnModalOpen(!isColumnModalOpen)}
                alwaysPresentFieldNames={[]}
                visibilities={columnVisibilities}
                setAVisibility={setAColumnVisibility}
                nameToLabelMap={consolidatedMetadataSchema.reduce(
                    (acc, field) => {
                        acc[field.name] = field.displayName ?? field.label ?? sentenceCase(field.name);
                        return acc;
                    },
                    {} as Record<string, string>,
                )}
            />
            <SeqPreviewModal
                seqId={previewedSeqId ?? ''}
                accessToken={accessToken}
                isOpen={previewedSeqId !== null}
                onClose={() => setPreviewedSeqId(null)}
                referenceGenomeSequenceNames={referenceGenomesSequenceNames}
                myGroups={myGroups}
                isHalfScreen={previewHalfScreen}
                setIsHalfScreen={setPreviewHalfScreen}
                setPreviewedSeqId={setPreviewedSeqId}
            />
            <div className='md:w-72'>
                <SearchForm
                    organism={organism}
                    clientConfig={clientConfig}
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    fieldValues={fieldValues}
                    setAFieldValue={setAFieldValue}
                    consolidatedMetadataSchema={consolidatedMetadataSchema}
                    lapisUrl={lapisUrl}
                    searchVisibilities={searchVisibilities}
                    setASearchVisibility={setASearchVisibility}
                    lapisSearchParameters={lapisSearchParameters}
                />
            </div>
            <div className='flex-1'>
                <RecentSequencesBanner organism={organism} />

                {(detailsHook.isError || aggregatedHook.isError) &&
                    // @ts-expect-error because response is not expected on error, but does exist
                    (aggregatedHook.error?.response?.status === 503 ? (
                        <div className='p-3 rounded-lg text-lg text-gray-700 text-italic'>
                            {' '}
                            The retrieval database is currently initializing – please check back later.
                        </div>
                    ) : (
                        <div className='bg-red-400 p-3 rounded-lg'>
                            <p>There was an error loading the data</p>
                            <details>
                                <summary className='text-xs cursor-pointer py-2'>More details</summary>
                                <p className='text-xs'>{JSON.stringify(detailsHook.error)}</p>

                                <p>{detailsHook.error?.message}</p>
                                <p>{aggregatedHook.error?.message}</p>
                            </details>
                        </div>
                    ))}
                {(detailsHook.isPaused || aggregatedHook.isPaused) &&
                    (!detailsHook.isSuccess || !aggregatedHook.isSuccess) && (
                        <ErrorBox title='Connection problem'>Please check your internet connection</ErrorBox>
                    )}

                <div
                    className={`
                        ${
                            !(firstClientSideLoadOfCountCompleted && firstClientSideLoadOfDataCompleted)
                                ? 'cursor-wait pointer-events-none'
                                : detailsHook.isLoading || aggregatedHook.isLoading
                                  ? 'opacity-50 pointer-events-none'
                                  : ''
                        }
                        `}
                >
                    <div className='text-sm text-gray-800 mb-6 justify-between flex md:px-6 items-baseline'>
                        <div className='mt-auto'>
                            Search returned{' '}
                            {totalSequences !== undefined
                                ? totalSequences.toLocaleString()
                                : oldCount !== null
                                  ? oldCount.toLocaleString()
                                  : initialCount.toLocaleString()}{' '}
                            sequence
                            {totalSequences === 1 ? '' : 's'}
                            {selectedSeqs.length > 0 && <span>, {selectedSeqs.length} selected</span>}
                            {detailsHook.isLoading ||
                            aggregatedHook.isLoading ||
                            !firstClientSideLoadOfCountCompleted ||
                            !firstClientSideLoadOfDataCompleted ? (
                                <span className='loading loading-spinner loading-xs ml-3 appearSlowly'></span>
                            ) : null}
                        </div>

                        <div className='flex'>
                            <button
                                className='text-gray-800 hover:text-gray-600 mr-4 underline text-primary-700 hover:text-primary-500'
                                onClick={() => setIsColumnModalOpen(true)}
                            >
                                Customize columns
                            </button>

                            <DownloadDialog
                                lapisUrl={lapisUrl}
                                lapisSearchParameters={lapisSearchParameters}
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                                hiddenFieldValues={hiddenFieldValues}
                            />
                        </div>
                    </div>

                    <Table
                        schema={schema}
                        data={
                            detailsHook.data?.data !== undefined
                                ? (detailsHook.data.data as TableSequenceData[])
                                : (oldData ?? initialData)
                        }
                        selectedSeqs={selectedSeqs}
                        setSelectedSeqs={setSelectedSeqs}
                        setPreviewedSeqId={setPreviewedSeqId}
                        previewedSeqId={previewedSeqId}
                        orderBy={
                            {
                                field: orderByField,
                                type: orderDirection,
                            } as OrderBy
                        }
                        setOrderByField={setOrderByField}
                        setOrderDirection={setOrderDirection}
                        columnsToShow={columnsToShow}
                    />

                    <div className='mt-4 flex justify-center'>
                        {totalSequences !== undefined && (
                            <SearchPagination
                                count={Math.ceil(totalSequences / pageSize)}
                                page={page}
                                setPage={setPage}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const consolidateGroupedFields = (filters: MetadataFilter[]): (MetadataFilter | GroupedMetadataFilter)[] => {
    const fieldList: (MetadataFilter | GroupedMetadataFilter)[] = [];
    const groupsMap = new Map<string, GroupedMetadataFilter>();

    for (const filter of filters) {
        if (filter.fieldGroup !== undefined) {
            if (!groupsMap.has(filter.fieldGroup)) {
                const fieldForGroup: GroupedMetadataFilter = {
                    name: filter.fieldGroup,
                    groupedFields: [],
                    type: filter.type,
                    grouped: true,
                    displayName: filter.fieldGroupDisplayName,
                    label: filter.label,
                    initiallyVisible: filter.initiallyVisible,
                };
                fieldList.push(fieldForGroup);
                groupsMap.set(filter.fieldGroup, fieldForGroup);
            }
            groupsMap.get(filter.fieldGroup)!.groupedFields.push(filter);
        } else {
            fieldList.push(filter);
        }
    }

    return fieldList;
};

export const SearchFullUI = (props: InnerSearchFullUIProps) => {
    const queryClient = new QueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            <InnerSearchFullUI {...props} />
        </QueryClientProvider>
    );
};
