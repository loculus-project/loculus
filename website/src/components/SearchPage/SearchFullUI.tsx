import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CustomizeModal } from './CustomizeModal.tsx';
import { DownloadDialog } from './DownloadDialog/DownloadDialog.tsx';
import { DownloadUrlGenerator } from './DownloadDialog/DownloadUrlGenerator.ts';
import { FieldFilter, SelectFilter, type SequenceFilter } from './DownloadDialog/SequenceFilters.tsx';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table, type TableSequenceData } from './Table';
import useQueryAsState from './useQueryAsState.js';
import { getLapisUrl } from '../../config.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { DATA_USE_TERMS_FIELD, pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import { type Schema, type FieldValues } from '../../types/config.ts';
import { type OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import { LinkOutMenu } from './DownloadDialog/LinkOutMenu.tsx';
import type { LinkOut } from '../../types/config.ts';
import {
    getFieldValuesFromQuery,
    getColumnVisibilitiesFromQuery,
    getFieldVisibilitiesFromQuery,
    VISIBILITY_PREFIX,
    COLUMN_VISIBILITY_PREFIX,
    getLapisSearchParameters,
    getMetadataSchemaWithExpandedRanges,
    consolidateGroupedFields,
} from '../../utils/search.ts';
import { EditDataUseTermsModal } from '../DataUseTerms/EditDataUseTermsModal.tsx';
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
    showEditDataUseTermsControls?: boolean;
    linkOuts: LinkOut[] | undefined;
}
interface QueryState {
    [key: string]: string;
}

const buildSequenceCountText = (totalSequences: number | undefined, oldCount: number | null, initialCount: number) => {
    const sequenceCount = totalSequences !== undefined ? totalSequences : oldCount !== null ? oldCount : initialCount;

    const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
    const pluralSuffix = sequenceCount === 1 ? '' : 's';

    return `Search returned ${formattedCount} sequence${pluralSuffix}`;
};

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
    linkOuts,   
    showEditDataUseTermsControls = false,
}: InnerSearchFullUIProps) => {
    if (!hiddenFieldValues) {
        hiddenFieldValues = {};
    }

    const metadataSchema = schema.metadata;

    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

    const consolidatedMetadataSchema = useMemo(() => {
        const metadataSchemaWithExpandedRanges = getMetadataSchemaWithExpandedRanges(metadataSchema);
        return consolidateGroupedFields(metadataSchemaWithExpandedRanges);
    }, [metadataSchema]);

    const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);
    const [previewHalfScreen, setPreviewHalfScreen] = useState(false);
    const [state, setState] = useQueryAsState(initialQueryDict);

    const searchVisibilities = useMemo(() => {
        return getFieldVisibilitiesFromQuery(schema, state);
    }, [schema, state]);

    const columnVisibilities = useMemo(
        () => getColumnVisibilitiesFromQuery(schema, state).set(DATA_USE_TERMS_FIELD, showEditDataUseTermsControls),
        [schema, state, showEditDataUseTermsControls],
    );

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

    const setPage = useCallback(
        (newPage: number) => {
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
        },
        [setState],
    );

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

    /**
     * Update field values (query parameters).
     * If value is '' or null, the query parameter is unset.
     */
    const setSomeFieldValues = useCallback(
        (...fieldValuesToSet: [string, string | number | null][]) => {
            setState((prev: any) => {
                const newState = { ...prev };
                fieldValuesToSet.forEach(([key, value]) => {
                    if (value === '' || value === null) {
                        delete newState[key];
                    } else {
                        newState[key] = value;
                    }
                });
                return newState;
            });
            setPage(1);
        },
        [setState, setPage],
    );

    const setASearchVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: any) => ({
            ...prev,
            [`${VISIBILITY_PREFIX}${fieldName}`]: visible ? 'true' : 'false',
        }));
        // if visible is false, we should also remove the field from the fieldValues
        if (!visible) {
            setSomeFieldValues([fieldName, '']);
        }
    };

    const setAColumnVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: any) => ({
            ...prev,
            [`${COLUMN_VISIBILITY_PREFIX}${fieldName}`]: visible ? 'true' : 'false',
        }));
    };

    const lapisUrl = getLapisUrl(clientConfig, organism);
    const downloadUrlGenerator = new DownloadUrlGenerator(organism, lapisUrl);

    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const aggregatedHook = hooks.useAggregated({}, {});
    const detailsHook = hooks.useDetails({}, {});

    const [selectedSeqs, setSelectedSeqs] = useState<Set<string>>(new Set());
    const sequencesSelected = selectedSeqs.size > 0;
    const clearSelectedSeqs = () => setSelectedSeqs(new Set());

    const lapisSearchParameters = useMemo(() => {
        return getLapisSearchParameters(fieldValues, referenceGenomesSequenceNames, schema);
    }, [fieldValues, referenceGenomesSequenceNames, schema]);

    const sequencesFilter: SequenceFilter = sequencesSelected
        ? new SelectFilter(selectedSeqs)
        : new FieldFilter(lapisSearchParameters, hiddenFieldValues, consolidatedMetadataSchema);

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
            <div className='md:w-[18rem]'>
                <SearchForm
                    organism={organism}
                    clientConfig={clientConfig}
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    fieldValues={fieldValues}
                    setSomeFieldValues={setSomeFieldValues}
                    consolidatedMetadataSchema={consolidatedMetadataSchema}
                    lapisUrl={lapisUrl}
                    searchVisibilities={searchVisibilities}
                    setASearchVisibility={setASearchVisibility}
                    lapisSearchParameters={lapisSearchParameters}
                />
            </div>
            <div className='md:w-[calc(100%-18.1rem)]'>
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
                        <ErrorBox title='Connection problem'>
                            The browser thinks you are offline. This will affect site usage, and many features may not
                            work. If you are actually online, please try using a different browser. If the problem
                            persists, feel free to create an issue in{' '}
                            <a href='https://github.com/pathoplexus/pathoplexus/issues'>our Github repo</a> or email us
                            at <a href='mailto:bug@pathoplexus.org'>bug@pathoplexus.org</a>.
                        </ErrorBox>
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
                            {buildSequenceCountText(totalSequences, oldCount, initialCount)}
                            {detailsHook.isLoading ||
                            aggregatedHook.isLoading ||
                            !firstClientSideLoadOfCountCompleted ||
                            !firstClientSideLoadOfDataCompleted ? (
                                <span className='loading loading-spinner loading-xs ml-3 appearSlowly'></span>
                            ) : null}
                        </div>

                        <div className='flex'>
                            {showEditDataUseTermsControls && (
                                <EditDataUseTermsModal
                                    lapisUrl={lapisUrl}
                                    clientConfig={clientConfig}
                                    accessToken={accessToken}
                                    sequenceFilter={sequencesFilter}
                                />
                            )}
                            <button
                                className='mr-4 underline text-primary-700 hover:text-primary-500'
                                onClick={() => setIsColumnModalOpen(true)}
                            >
                                Customize columns
                            </button>
                            {sequencesSelected ? (
                                <button
                                    className='mr-4 underline text-primary-700 hover:text-primary-500'
                                    onClick={clearSelectedSeqs}
                                >
                                    Clear selection
                                </button>
                            ) : null}

                            <DownloadDialog
                                downloadUrlGenerator={downloadUrlGenerator}
                                sequenceFilter={sequencesFilter}
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                            />
                            {linkOuts!==undefined && linkOuts.length > 0 && (
                            <LinkOutMenu
                                downloadUrlGenerator={downloadUrlGenerator}
                                sequenceFilter={sequencesFilter}
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                                linkOuts={linkOuts}
                                />
                            )
                            }
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

export const SearchFullUI = (props: InnerSearchFullUIProps) => {
    const queryClient = new QueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            <InnerSearchFullUI {...props} />
        </QueryClientProvider>
    );
};
