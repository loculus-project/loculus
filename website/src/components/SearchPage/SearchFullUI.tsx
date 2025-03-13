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
import useQueryParamState from '../../hooks/useQueryParamState';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { DATA_USE_TERMS_FIELD, pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import { type Schema, type FieldValues, type SequenceFlaggingConfig } from '../../types/config.ts';
import { type OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import { removeMutationQueries } from '../../utils/mutation.ts';
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
import { ActiveFilters } from '../common/ActiveFilters.tsx';
import ErrorBox from '../common/ErrorBox.tsx';

/**
 * A hook that syncs state with URL parameters.
 * 
 * @param paramName The name of the URL parameter to sync with
 * @param queryState The current URL query state object
 * @param defaultValue The default value to use if the parameter is not present in the URL
 * @param setState Function to update the URL query state
 * @returns [value, setValue] tuple similar to useState
 */
function useUrlParamState<T>(
  paramName: string,
  queryState: Record<string, string>,
  defaultValue: T,
  setState: (callback: (prev: Record<string, string>) => Record<string, string>) => void,
  shouldRemove: (value: T) => boolean
): [T, (newValue: T) => void] {
  // Initialize state from URL params
  const [valueState, setValueState] = useState<T>(
    queryState[paramName] !== undefined 
      ? (paramName === 'page' 
          ? parseInt(queryState[paramName], 10) as unknown as T 
          : paramName === 'halfScreen' 
            ? (queryState[paramName] === 'true') as unknown as T 
            : queryState[paramName] as unknown as T)
      : defaultValue
  );

  // Create URL update function
  const updateUrlParam = useCallback((newValue: T) => {
    setState((prev: Record<string, string>) => {
      if (shouldRemove(newValue)) {
        const newState = { ...prev };
        delete newState[paramName];
        return newState;
      } else {
        return {
          ...prev,
          [paramName]: String(newValue),
        };
      }
    });
  }, [paramName, setState, shouldRemove]);

  // Create combined setter that updates both state and URL
  const setValue = useCallback((newValue: T) => {
    setValueState(newValue);
    updateUrlParam(newValue);
  }, [updateUrlParam]);

  // Sync state from URL when URL params change
  useEffect(() => {
    let urlValue: T;
    
    if (paramName === 'halfScreen') {
      urlValue = (queryState[paramName] === 'true') as unknown as T;
    } else if (paramName === 'selectedSeq') {
      urlValue = (queryState[paramName] || null) as unknown as T;
    } else {
      urlValue = (queryState[paramName] !== undefined ? queryState[paramName] : defaultValue) as unknown as T;
    }
    
    if (JSON.stringify(urlValue) !== JSON.stringify(valueState)) {
      setValueState(urlValue);
    }
  }, [queryState, paramName, defaultValue, valueState]);

  return [valueState, setValue];
}

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
}

interface QueryState {
    [key: string]: string;
}

const buildSequenceCountText = (totalSequences: number | undefined, oldCount: number | null, initialCount: number) => {
    const sequenceCount = totalSequences ?? oldCount ?? initialCount;

    const formattedCount = formatNumberWithDefaultLocale(sequenceCount);
    const pluralSuffix = sequenceCount === 1 ? '' : 's';

    return `Search returned ${formattedCount} sequence${pluralSuffix}`;
};

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return -- TODO(#3451) this component is a mess a needs to be refactored */
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

    const [state, setState] = useQueryAsState(initialQueryDict);

<<<<<<< HEAD
    // Initialize half-screen state from URL
    const [previewHalfScreen, setPreviewHalfScreenState] = useState(state.halfScreen === 'true');
    
    // Function to update half-screen state and URL parameters
    const setPreviewHalfScreen = useCallback((value: boolean) => {
        setPreviewHalfScreenState(value);
        setState(prev => {
            if (!value) {
                const withoutParam = {...prev};
                delete withoutParam.halfScreen;
                return withoutParam;
            } else {
                return {...prev, halfScreen: 'true'};
            }
        });
    }, [setState]);
    
    // Initialize selected sequence state from URL
    const [previewedSeqId, setPreviewedSeqIdState] = useState<string | null>(state.selectedSeq || null);
    
    // Function to update selected sequence state and URL parameters
    const setPreviewedSeqId = useCallback((value: string | null) => {
        setPreviewedSeqIdState(value);
        setState(prev => {
            if (value === null) {
                const withoutParam = {...prev};
                delete withoutParam.selectedSeq;
                return withoutParam;
            } else {
                return {...prev, selectedSeq: value};
            }
        });
    }, [setState]);
=======
  
    
    
    const [previewedSeqId, setPreviewedSeqId] = useUrlParamState('selectedSeq', state, null, setState, (value) => value === null);
    const [previewHalfScreen, setPreviewHalfScreen] = useUrlParamState('halfScreen', state, false, setState, (value) => value === false);   
>>>>>>> 8e30ac2e09a05f1efd3a03b7a2420806291a47cc

    const searchVisibilities = useMemo(() => {
        return getFieldVisibilitiesFromQuery(schema, state);
    }, [schema, state]);

    const columnVisibilities = useMemo(() => getColumnVisibilitiesFromQuery(schema, state), [schema, state]);

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

    // Initialize page state from URL
    const [pageState, setPageState] = useState(parseInt(state.page ?? '1', 10));
    
    // Function to update page state and URL parameters
    const setPage = useCallback((value: number) => {
        setPageState(value);
        setState(prev => {
            if (value === 1) {
                const withoutParam = {...prev};
                delete withoutParam.page;
                return withoutParam;
            } else {
                return {...prev, page: value.toString()};
            }
        });
    }, [setState]);

    const setOrderByField = (field: string) => {
        setState((prev: QueryState) => ({
            ...prev,
            orderBy: field,
            page: '1',
        }));
    };
    
    const setOrderDirection = (direction: string) => {
        setState((prev: QueryState) => ({
            ...prev,
            order: direction,
            page: '1',
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

    const lapisSearchParameters = useMemo(() => {
        return getLapisSearchParameters(fieldValues, referenceGenomesSequenceNames, schema);
    }, [fieldValues, referenceGenomesSequenceNames, schema]);

    const tableFilter = new FieldFilter(lapisSearchParameters, hiddenFieldValues, consolidatedMetadataSchema);
    const removeFilter = (key: string) => {
        switch (key) {
            case 'nucleotideMutations':
                setSomeFieldValues([
                    'mutation',
                    removeMutationQueries(
                        fieldValues.mutation as string,
                        referenceGenomesSequenceNames,
                        'nucleotide',
                        'substitutionOrDeletion',
                    ),
                ]);
                break;
            case 'aminoAcidMutations':
                setSomeFieldValues([
                    'mutation',
                    removeMutationQueries(
                        fieldValues.mutation as string,
                        referenceGenomesSequenceNames,
                        'aminoAcid',
                        'substitutionOrDeletion',
                    ),
                ]);
                break;
            case 'nucleotideInsertions':
                setSomeFieldValues([
                    'mutation',
                    removeMutationQueries(
                        fieldValues.mutation as string,
                        referenceGenomesSequenceNames,
                        'nucleotide',
                        'insertion',
                    ),
                ]);
                break;
            case 'aminoAcidInsertions':
                setSomeFieldValues([
                    'mutation',
                    removeMutationQueries(
                        fieldValues.mutation as string,
                        referenceGenomesSequenceNames,
                        'aminoAcid',
                        'insertion',
                    ),
                ]);
                break;
            default:
                setSomeFieldValues([key, null]);
        }
    };

    const downloadFilter: SequenceFilter = sequencesSelected ? new SelectFilter(selectedSeqs) : tableFilter;

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
                sequenceFlaggingConfig={sequenceFlaggingConfig}
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
                    showMutationSearch={schema.submissionDataTypes.consensusSequences}
                />
            </div>
            <div
                className={`md:w-[calc(100%-18.1rem)]`}
                style={{ paddingBottom: previewedSeqId !== null && previewHalfScreen ? '50vh' : '0' }}
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
                                : detailsHook.isLoading || aggregatedHook.isLoading
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
                    <div className='text-sm text-gray-800 mb-6 justify-between flex items-baseline'>
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
                                richFastaHeaderFields={schema.richFastaHeaderFields}
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

export const SearchFullUI = (props: InnerSearchFullUIProps) => {
    const queryClient = new QueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            <InnerSearchFullUI {...props} />
        </QueryClientProvider>
    );
};