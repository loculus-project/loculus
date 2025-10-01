import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { DownloadDialog } from './DownloadDialog/DownloadDialog.tsx';
import { DownloadUrlGenerator } from './DownloadDialog/DownloadUrlGenerator.ts';
import { LinkOutMenu } from './DownloadDialog/LinkOutMenu.tsx';
import { FieldFilterSet, SequenceEntrySelection, type SequenceFilter } from './DownloadDialog/SequenceFilters.tsx';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchErrorDisplay } from './SearchErrorDisplay';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table, type TableSequenceData } from './Table';
import { buildSequenceCountText } from './searchHelpers';
import { stillRequiresSuborganismSelection } from './stillRequiresSuborganismSelection.tsx';
import type { QueryState } from './useQueryAsState';
import { useSearchLapisQueries } from './useSearchLapisQueries';
import { useSearchState } from './useSearchState';
import { getLapisUrl } from '../../config.ts';
import { DATA_USE_TERMS_FIELD, pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import type { LinkOut } from '../../types/config.ts';
import { type FieldValues, type Schema, type SequenceFlaggingConfig } from '../../types/config.ts';
import { type OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { MetadataFilterSchema } from '../../utils/search.ts';
import { EditDataUseTermsModal } from '../DataUseTerms/EditDataUseTermsModal.tsx';
import { ActiveFilters } from '../common/ActiveFilters.tsx';
import { type FieldItem, FieldSelectorModal } from '../common/FieldSelectorModal.tsx';

export interface InnerSearchFullUIProps {
    accessToken?: string;
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema;
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

export const InnerSearchFullUI = ({
    accessToken,
    referenceGenomeLightweightSchema,
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

    const filterSchema = useMemo(() => new MetadataFilterSchema(schema.metadata), [schema.metadata]);
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

    const {
        previewedSeqId,
        setPreviewedSeqId,
        previewHalfScreen,
        setPreviewHalfScreen,
        selectedSuborganism,
        setSelectedSuborganism,
        searchVisibilities,
        columnVisibilities,
        columnsToShow,
        orderByField,
        orderDirection,
        page,
        setPage,
        setOrderByField,
        setOrderDirection,
        fieldValues,
        setSomeFieldValues,
        removeFilter,
        setASearchVisibility,
        setAColumnVisibility,
    } = useSearchState(initialQueryDict, schema, hiddenFieldValues);

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

    const [selectedSeqs, setSelectedSeqs] = useState<Set<string>>(new Set());
    const sequencesSelected = selectedSeqs.size > 0;
    const clearSelectedSeqs = () => setSelectedSeqs(new Set());

    const tableFilter = useMemo(
        () => new FieldFilterSet(filterSchema, fieldValues, hiddenFieldValues, referenceGenomeLightweightSchema),
        [fieldValues, hiddenFieldValues, referenceGenomeLightweightSchema, filterSchema],
    );

    /**
     * The `lapisSearchParameters` are derived from the `fieldValues` (the search boxes).
     * Some values are modified slightly or expanded based on field definitions.
     */
    const lapisSearchParameters = useMemo(() => tableFilter.toApiParams(), [tableFilter]);

    const downloadFilter: SequenceFilter = sequencesSelected ? new SequenceEntrySelection(selectedSeqs) : tableFilter;

    const {
        aggregatedHook,
        detailsHook,
        totalSequences,
        oldData,
        oldCount,
        firstClientSideLoadOfDataCompleted,
        firstClientSideLoadOfCountCompleted,
    } = useSearchLapisQueries(
        lapisUrl,
        lapisSearchParameters,
        columnsToShow,
        schema.primaryKey,
        page,
        orderByField,
        orderDirection,
    );

    const linkOutSequenceCount = downloadFilter.sequenceCount() ?? totalSequences;

    const showMutationSearch =
        schema.submissionDataTypes.consensusSequences &&
        !stillRequiresSuborganismSelection(referenceGenomeLightweightSchema, selectedSuborganism);

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
                referenceGenomeLightweightSchema={referenceGenomeLightweightSchema}
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
                    referenceGenomeLightweightSchema={referenceGenomeLightweightSchema}
                    fieldValues={fieldValues}
                    setSomeFieldValues={setSomeFieldValues}
                    filterSchema={filterSchema}
                    lapisUrl={lapisUrl}
                    searchVisibilities={searchVisibilities}
                    setASearchVisibility={setASearchVisibility}
                    lapisSearchParameters={lapisSearchParameters}
                    showMutationSearch={showMutationSearch}
                    suborganismIdentifierField={schema.suborganismIdentifierField}
                    selectedSuborganism={selectedSuborganism}
                    setSelectedSuborganism={setSelectedSuborganism}
                />
            </div>
            <div
                className={`md:w-[calc(100%-18.1rem)]`}
                style={{ paddingBottom: Boolean(previewedSeqId) && previewHalfScreen ? '50vh' : '0' }}
            >
                <RecentSequencesBanner organism={organism} />

                <SearchErrorDisplay detailsHook={detailsHook} aggregatedHook={aggregatedHook} />

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
                                referenceGenomeLightweightSchema={referenceGenomeLightweightSchema}
                                allowSubmissionOfConsensusSequences={schema.submissionDataTypes.consensusSequences}
                                dataUseTermsEnabled={dataUseTermsEnabled}
                                metadata={schema.metadata}
                                richFastaHeaderFields={schema.richFastaHeaderFields}
                                selectedSuborganism={selectedSuborganism}
                                suborganismIdentifierField={schema.suborganismIdentifierField}
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
