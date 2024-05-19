import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table } from './Table';
import { parseMutationString } from './fields/MutationField.tsx';
import useQueryAsState from './useQueryAsState.js';
import { getLapisUrl } from '../../config.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import { type MetadataFilter, type Schema } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import type { SearchResponse } from '../../utils/search.ts';

const orderKey = 'orderBy';
const orderDirectionKey = 'order';

const VISIBILITY_PREFIX = 'visibility_';

interface InnerSearchFullUIProps {
    accessToken: string;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    myGroups: Group[];
    organism: string;
    clientConfig: ClientConfig;
    schema: Schema;
}

export const InnerSearchFullUI = ({
    accessToken,
    referenceGenomesSequenceNames,
    myGroups,
    organism,
    clientConfig,
    schema,
}: InnerSearchFullUIProps) => {
    const metadataSchema = schema.metadata;

    const metadataSchemaWithExpandedRanges = useMemo(() => {
        const result = [];
        for (const field of metadataSchema) {
            if (field.rangeSearch) {
                const fromField = {
                    ...field,
                    name: `${field.name}From`,
                    label: `From`,
                    fieldGroup: field.name,
                    fieldGroupDisplayName: field.displayName,
                };
                const toField = {
                    ...field,
                    name: `${field.name}To`,
                    label: `To`,
                    fieldGroup: field.name,
                    fieldGroupDisplayName: field.displayName,
                };
                result.push(fromField);
                result.push(toField);
            } else {
                result.push(field);
            }
        }
        return result;
    }, [metadataSchema]);

    const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);
    const [previewHalfScreen, setPreviewHalfScreen] = useState(false);
    const [state, setState] = useQueryAsState({});
    const [page, setPage] = useState(1);

    const orderByField = state.orderBy ?? schema.primaryKey;
    const orderDirection = state.order ?? 'ascending';

    const setOrderByField = (field: string) => {
        setState((prev) => ({
            ...prev,
            orderBy: field,
        }));
    };
    const setOrderDirection = (direction: string) => {
        setState((prev) => ({
            ...prev,
            order: direction,
        }));
    };

    const visibilities = useMemo(() => {
        const visibilities = new Map<string, boolean>();
        schema.metadata.forEach((field) => {
            visibilities.set(field.name, field.initiallyVisible);
        });

        const visibilityKeys = Object.keys(state).filter((key) => key.startsWith(VISIBILITY_PREFIX));

        for (const key of visibilityKeys) {
            visibilities.set(key.slice(VISIBILITY_PREFIX.length), state[key] === 'true');
        }
        return visibilities;
    }, [state]);

    const fieldValues = useMemo(() => {
        const fieldKeys = Object.keys(state)
            .filter((key) => !key.startsWith(VISIBILITY_PREFIX))
            .filter((key) => key !== orderKey && key !== orderDirectionKey);
        const values = {};
        for (const key of fieldKeys) {
            values[key] = state[key];
        }
        return values;
    }, [state]);

    const setAFieldValue = (fieldName: string, value: string) => {
        setState((prev) => ({
            ...prev,
            [fieldName]: value,
        }));
    };

    const setAVisibility = (fieldName: string, visible: boolean) => {
        setState((prev) => ({
            ...prev,
            [`${VISIBILITY_PREFIX}${fieldName}`]: visible ? 'true' : 'false',
        }));
        // if visible is false, we should also remove the field from the fieldValues
        if (!visible) {
            setAFieldValue(fieldName, '');
        }
    };

    const lapisUrl = getLapisUrl(clientConfig, organism);

    const consolidatedMetadataSchema = consolidateGroupedFields(metadataSchemaWithExpandedRanges);

    const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
    const aggregatedHook = hooks.useAggregated({}, {});
    const detailsHook = hooks.useDetails({}, {});

    console.log('referenceGenomeSequenceNames', referenceGenomesSequenceNames);

    const lapisSearchParameters = useMemo(() => {
        const sequenceFilters = Object.fromEntries(
            Object.entries(fieldValues).filter(([, value]) => value !== undefined && value !== ''),
        );

        // if field name is accession, split on ,
        if (sequenceFilters.accession) {
            sequenceFilters.accession = textAccessionsToList(sequenceFilters.accession);
        }

        delete sequenceFilters.mutation;

        const mutationFilter = parseMutationString(fieldValues.mutation ?? '', referenceGenomesSequenceNames);

        return {
            ...sequenceFilters,
            nucleotideMutations: mutationFilter
                .filter((m) => m.baseType === 'nucleotide' && m.mutationType === 'substitutionOrDeletion')
                .map((m) => m.text),
            aminoAcidMutations: mutationFilter
                .filter((m) => m.baseType === 'aminoAcid' && m.mutationType === 'substitutionOrDeletion')
                .map((m) => m.text),
            nucleotideInsertions: mutationFilter
                .filter((m) => m.baseType === 'nucleotide' && m.mutationType === 'insertion')
                .map((m) => m.text),
            aminoAcidInsertions: mutationFilter
                .filter((m) => m.baseType === 'aminoAcid' && m.mutationType === 'insertion')
                .map((m) => m.text),
        };
    }, [fieldValues, referenceGenomesSequenceNames]);

    useEffect(() => {
        aggregatedHook.mutate({
            ...lapisSearchParameters,
            fields: [],
        });
        detailsHook.mutate({
            ...lapisSearchParameters,
            fields: [...schema.tableColumns, schema.primaryKey],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: [
                {
                    field: orderByField,
                    type: orderDirection,
                } as OrderBy,
            ],
        });
    }, [lapisSearchParameters, schema.tableColumns, schema.primaryKey, pageSize, page, orderByField, orderDirection]);

    const totalSequences = aggregatedHook.data?.data[0].count ?? undefined;

    const [oldData, setOldData] = useState<SearchResponse | null>(null);
    const [oldCount, setOldCount] = useState<number | null>(null);

    useEffect(() => {
        if (detailsHook.data?.data && oldData !== detailsHook.data.data) {
            setOldData(detailsHook.data.data);
        }
    }, [detailsHook.data?.data, oldData]);

    useEffect(() => {
        if (aggregatedHook.data?.data && oldCount !== aggregatedHook.data.data[0].count) {
            setOldCount(aggregatedHook.data.data[0].count);
        }
    }, [aggregatedHook.data?.data, oldCount]);

    return (
        <div className='flex flex-col md:flex-row gap-8 md:gap-4'>
            <SeqPreviewModal
                seqId={previewedSeqId ?? ''}
                accessToken={accessToken}
                isOpen={previewedSeqId !== null}
                onClose={() => setPreviewedSeqId(null)}
                referenceGenomeSequenceNames={referenceGenomesSequenceNames}
                myGroups={
                    []
                    // TODONOW
                }
                isHalfScreen={previewHalfScreen}
                setIsHalfScreen={setPreviewHalfScreen}
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
                    visibilities={visibilities}
                    setAVisibility={setAVisibility}
                    lapisSearchParameters={lapisSearchParameters}
                />
            </div>
            <div className='flex-1'>
                <RecentSequencesBanner organism={organism} />

                {(detailsHook.isError || aggregatedHook.isError) && (
                    <>
                        detailsHook.error?.status === 503 ? <div> No data in database</div> :
                        <div className='bg-red-400'>
                            <p>There was an error loading the data.</p>
                            <p>{JSON.stringify(detailsHook.error)}</p>

                            <p>{detailsHook.error?.message}</p>
                            <p>{aggregatedHook.error?.message}</p>
                        </div>
                    </>
                )}
                {(detailsHook.isPaused || aggregatedHook.isPaused) &&
                    (!detailsHook.isSuccess || !aggregatedHook.isSuccess) && (
                        <div className='bg-red-800'>Connection problem</div>
                    )}
                {!(totalSequences === undefined && oldCount === null) && (
                    <div
                        className={`
                        ${detailsHook.isLoading || aggregatedHook.isLoading ? 'opacity-50 pointer-events-none' : ''}
                        `}
                    >
                        <div className='mt-auto'>
                            Search returned{' '}
                            {totalSequences !== undefined
                                ? totalSequences.toLocaleString()
                                : oldCount
                                  ? oldCount.toLocaleString()
                                  : ''}{' '}
                            sequence
                            {totalSequences === 1 ? '' : 's'}
                            {detailsHook.isLoading || aggregatedHook.isLoading ? (
                                <span className='loading loading-spinner loading-xs ml-3 appearSlowly'></span>
                            ) : null}
                        </div>

                        <Table
                            schema={schema}
                            data={detailsHook.data?.data !== undefined ? detailsHook.data.data : oldData ?? []}
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
                )}
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

const textAccessionsToList = (text: string): string[] => {
    const accessions = text
        .split(/[\t,;\n ]/)
        .map((s) => s.trim())
        .filter((s) => s !== '')
        .map((s) => {
            if (s.includes('.')) {
                return s.split('.')[0];
            }
            return s;
        });

    return accessions;
};
