import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DownloadDialog } from './DownloadDialog/DownloadDialog.tsx';
import { DownloadUrlGenerator } from './DownloadDialog/DownloadUrlGenerator.ts';
import { LinkOutMenu } from './DownloadDialog/LinkOutMenu.tsx';
import { FieldFilterSet, SequenceEntrySelection, type SequenceFilter } from './DownloadDialog/SequenceFilters.tsx';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table, type TableSequenceData } from './Table';
import useQueryAsState, { type QueryState } from './useQueryAsState';
import { getLapisUrl } from '../../config.ts';
import useUrlParamState from '../../hooks/useUrlParamState';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { DATA_USE_TERMS_FIELD, pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import type { LinkOut } from '../../types/config.ts';
import {
    type FieldValues,
    type FieldValueUpdate,
    type Schema,
    type SequenceFlaggingConfig,
    type SetSomeFieldValues,
} from '../../types/config.ts';
import { type OrderBy, type OrderDirection } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import {
    COLUMN_VISIBILITY_PREFIX,
    getColumnVisibilitiesFromQuery,
    getFieldVisibilitiesFromQuery,
    MetadataFilterSchema,
    NULL_QUERY_VALUE,
    VISIBILITY_PREFIX,
} from '../../utils/search.ts';
import { EditDataUseTermsModal } from '../DataUseTerms/EditDataUseTermsModal.tsx';
import { ActiveFilters } from '../common/ActiveFilters.tsx';
import ErrorBox from '../common/ErrorBox.tsx';
import { type FieldItem, FieldSelectorModal } from '../common/FieldSelectorModal.tsx';

export interface InnerSearchFullUIProps {
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
    dataUseTermsEnabled?: boolean;
    sequenceFlaggingConfig?: SequenceFlaggingConfig;
    linkOuts?: LinkOut[];
}

const buildSequenceCountText = (totalSequences: number | undefined, oldCount: number | null, initialCount: number) => {
    const sequenceCount = totalSequences ?? oldCount ?? initialCount;

    const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
    const pluralSuffix = sequenceCount === 1 ? '' : 's';

    return `Search returned ${formattedCount} sequence${pluralSuffix}`;
};

/* eslint-disable @typescript-eslint/no-unsafe-member-access -- TODO(#3451) this component is a mess a needs to be refactored */
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
    showEditDataUseTermsControls = false,
    dataUseTermsEnabled = true,
    sequenceFlaggingConfig,
    linkOuts,
}: InnerSearchFullUIProps) => {
    hiddenFieldValues ??= {};

    const metadataSchema = schema.metadata;
    const filterSchema = useMemo(() => new MetadataFilterSchema(metadataSchema), [metadataSchema]);

    const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);

    const columnFieldItems: FieldItem[] = useMemo(
        () =>
            schema.metadata
                .filter((field) => !(field.hideInSearchResultsTable ?? false))
                .map((field) => ({
                    name: field.name,
                    displayName: field.displayName ?? field.name,
                    header: field.header,
                    alwaysSelected: field.name === schema.primaryKey,
                    disabled: field.name === schema.primaryKey,
                })),
        [schema.metadata, schema.primaryKey],
    );

    const [state, setState] = useQueryAsState(initialQueryDict);

    const [previewedSeqId, setPreviewedSeqId] = useUrlParamState<string | null>(
        'selectedSeq',
        state,
        null,
        setState,
        'nullable-string',
        (value) => !value,
    );
    const [previewHalfScreen, setPreviewHalfScreen] = useUrlParamState(
        'halfScreen',
        state,
        false,
        setState,
        'boolean',
        (value) => !value,
    );

    const searchVisibilities = useMemo(() => {
        return getFieldVisibilitiesFromQuery(schema, state);
    }, [schema, state]);

    const columnVisibilities = useMemo(() => getColumnVisibilitiesFromQuery(schema, state), [schema, state]);

    const columnsToShow = useMemo(() => {
        return schema.metadata
            .filter((field) => columnVisibilities.get(field.name) === true)
            .map((field) => field.name);
    }, [schema.metadata, columnVisibilities]);

    let orderByField = state.orderBy ?? schema.defaultOrderBy;
    if (!columnsToShow.includes(orderByField)) {
        orderByField = schema.primaryKey;
    }

    const orderDirection = state.order ?? schema.defaultOrder;

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
            page: '1',
        }));
    };

    const setOrderDirection = (direction: OrderDirection) => {
        setState((prev: QueryState) => ({
            ...prev,
            order: direction,
            page: '1',
        }));
    };

    /**
     * The `fieldValues` are the values of the search fields.
     * The values are initially loaded from the default values set in `hiddenFieldValues`
     * and the initial `state` (URL search params).
     */
    const fieldValues = useMemo(() => {
        return filterSchema.getFieldValuesFromQuery(state, hiddenFieldValues);
    }, [state, hiddenFieldValues, filterSchema]);

    /**
     * Update field values (query parameters).
     * If value is '' or null, the query parameter is unset.
     * For multi-select fields, we handle fieldValuesToSet as an array where:
     * - If value is an array, it sets multiple values for that field
     * - If value is '' or null, it clears the field
     */
    const setSomeFieldValues: SetSomeFieldValues = useCallback(
        (...fieldValuesToSet: FieldValueUpdate[]) => {
            setState((prev: QueryState) => {
                const newState = { ...prev };
                fieldValuesToSet.forEach(([key, value]) => {
                    if (value === '' || value === null) {
                        if (Object.keys(hiddenFieldValues).includes(key)) {
                            // keep explicitly empty fields because they override the hiddenFieldValues here
                            newState[key] = '';
                        } else {
                            // we can delete keys that are not in the hiddenFieldValues
                            delete newState[key];
                        }
                    } else if (Array.isArray(value)) {
                        // Handle array values for multi-select
                        if (value.length === 0) {
                            delete newState[key];
                        } else {
                            newState[key] = value.map((v) => v ?? NULL_QUERY_VALUE);
                        }
                    } else {
                        newState[key] = value;
                    }
                });
                return newState;
            });
            setPage(1);
        },
        [setState, setPage, hiddenFieldValues],
    );

    const removeFilter = (metadataFilterName: string) => {
        if (Object.keys(hiddenFieldValues).includes(metadataFilterName)) {
            const hiddenValue = hiddenFieldValues[metadataFilterName];
            // If it's an array with nulls, filter them out (shouldn't happen but TypeScript doesn't know)
            const valueToSet = Array.isArray(hiddenValue)
                ? hiddenValue.filter((v): v is string => v !== null)
                : hiddenValue;
            setSomeFieldValues([metadataFilterName, valueToSet]);
        } else {
            setSomeFieldValues([metadataFilterName, null]);
        }
    };

    const setASearchVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: QueryState) => {
            const newState = { ...prev };
            const key = `${VISIBILITY_PREFIX}${fieldName}`;
            const metadataField = schema.metadata.find((field) => {
                let name = field.name;
                if (field.rangeOverlapSearch) {
                    name = field.rangeOverlapSearch.rangeName;
                }
                return name === fieldName;
            });
            const defaultVisible = metadataField?.initiallyVisible === true;
            if (visible === defaultVisible) {
                delete newState[key];
            } else {
                newState[key] = visible ? 'true' : 'false';
            }
            if (!visible) {
                delete newState[fieldName];
            }
            return newState;
        });
        if (!visible) {
            setPage(1);
        }
    };

    const setAColumnVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: QueryState) => {
            const newState = { ...prev };
            const key = `${COLUMN_VISIBILITY_PREFIX}${fieldName}`;
            const defaultVisible = schema.tableColumns.includes(fieldName);
            if (visible === defaultVisible) {
                delete newState[key];
            } else {
                newState[key] = visible ? 'true' : 'false';
            }
            return newState;
        });
    };

    useEffect(() => {
        if (showEditDataUseTermsControls && dataUseTermsEnabled) {
            setAColumnVisibility(DATA_USE_TERMS_FIELD, true);
        }
    }, []);

    const lapisUrl = getLapisUrl(clientConfig, organism);
    const downloadUrlGenerator = new DownloadUrlGenerator(
        organism,
        lapisUrl,
        dataUseTermsEnabled,
        schema.richFastaHeaderFields,
    );

    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const aggregatedHook = hooks.useAggregated({}, {});
    const detailsHook = hooks.useDetails({}, {});

    const [selectedSeqs, setSelectedSeqs] = useState<Set<string>>(new Set());
    const sequencesSelected = selectedSeqs.size > 0;
    const clearSelectedSeqs = () => setSelectedSeqs(new Set());

    const tableFilter = useMemo(
        () => new FieldFilterSet(filterSchema, fieldValues, hiddenFieldValues, referenceGenomesSequenceNames),
        [fieldValues, hiddenFieldValues, referenceGenomesSequenceNames, filterSchema],
    );

    /**
     * The `lapisSearchParameters` are derived from the `fieldValues` (the search boxes).
     * Some values are modified slightly or expanded based on field definitions.
     */
    const lapisSearchParameters = useMemo(() => tableFilter.toApiParams(), [tableFilter]);

    const downloadFilter: SequenceFilter = sequencesSelected ? new SequenceEntrySelection(selectedSeqs) : tableFilter;

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
    }, [lapisSearchParameters, schema.tableColumns, schema.primaryKey, pageSize, page, orderByField, orderDirection]);

    const totalSequences = aggregatedHook.data?.data[0].count ?? undefined;
    const linkOutSequenceCount = downloadFilter.sequenceCount() ?? totalSequences;

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
            <FieldSelectorModal
                title='Customize columns'
                isOpen={isColumnModalOpen}
                onClose={() => setIsColumnModalOpen(!isColumnModalOpen)}
                fields={columnFieldItems}
                selectedFields={
                    new Set(
                        Array.from(columnVisibilities.entries())
                            .filter(([_, visible]) => visible)
                            .map(([field]) => field),
                    )
                }
                setFieldSelected={setAColumnVisibility}
            />
            <SeqPreviewModal
                key={previewedSeqId ?? 'seq-modal'}
                seqId={previewedSeqId ?? ''}
                accessToken={accessToken}
                isOpen={Boolean(previewedSeqId)}
                onClose={() => setPreviewedSeqId(null)}
                referenceGenomeSequenceNames={referenceGenomesSequenceNames}
                myGroups={myGroups}
                isHalfScreen={previewHalfScreen}
                setIsHalfScreen={setPreviewHalfScreen}
                setPreviewedSeqId={(seqId: string | null) => setPreviewedSeqId(seqId)}
                sequenceFlaggingConfig={sequenceFlaggingConfig}
            />
            <div className='md:w-[18rem]'>
                <SearchForm
                    organism={organism}
                    clientConfig={clientConfig}
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    fieldValues={fieldValues}
                    setSomeFieldValues={setSomeFieldValues}
                    filterSchema={filterSchema}
                    lapisUrl={lapisUrl}
                    searchVisibilities={searchVisibilities}
                    setASearchVisibility={setASearchVisibility}
                    lapisSearchParameters={lapisSearchParameters}
                    showMutationSearch={schema.submissionDataTypes.consensusSequences}
                />
            </div>
            <div
                className={`md:w-[calc(100%-18.1rem)]`}
                style={{ paddingBottom: Boolean(previewedSeqId) && previewHalfScreen ? '50vh' : '0' }}
            >
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
                                : detailsHook.isPending || aggregatedHook.isPending
                                  ? 'opacity-50 pointer-events-none'
                                  : ''
                        }
                        `}
                >
                    {!tableFilter.isEmpty() && (
                        <div className='pt-3 pb-2'>
                            <ActiveFilters sequenceFilter={tableFilter} removeFilter={removeFilter} />
                        </div>
                    )}
                    <div className='text-sm text-gray-800 mb-6 justify-between flex flex-col sm:flex-row items-baseline gap-4'>
                        <div className='mt-auto'>
                            {buildSequenceCountText(totalSequences, oldCount, initialCount)}
                            {detailsHook.isPending ||
                            aggregatedHook.isPending ||
                            !firstClientSideLoadOfCountCompleted ||
                            !firstClientSideLoadOfDataCompleted ? (
                                <span className='loading loading-spinner loading-xs ml-3 appearSlowly'></span>
                            ) : null}
                        </div>
                        <div className='flex'>
                            {showEditDataUseTermsControls && dataUseTermsEnabled && (
                                <EditDataUseTermsModal
                                    lapisUrl={lapisUrl}
                                    clientConfig={clientConfig}
                                    accessToken={accessToken}
                                    sequenceFilter={downloadFilter}
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
                                sequenceFilter={downloadFilter}
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                                allowSubmissionOfConsensusSequences={schema.submissionDataTypes.consensusSequences}
                                dataUseTermsEnabled={dataUseTermsEnabled}
                                metadata={schema.metadata}
                                richFastaHeaderFields={schema.richFastaHeaderFields}
                            />
                            {linkOuts !== undefined && linkOuts.length > 0 && (
                                <LinkOutMenu
                                    downloadUrlGenerator={downloadUrlGenerator}
                                    sequenceFilter={downloadFilter}
                                    sequenceCount={linkOutSequenceCount}
                                    linkOuts={linkOuts}
                                    dataUseTermsEnabled={dataUseTermsEnabled}
                                />
                            )}
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
                        setPreviewedSeqId={(seqId: string | null) => setPreviewedSeqId(seqId)}
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
