import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { useEffect, useMemo, useState } from 'react';

import { DownloadDialog } from './DownloadDialog/DownloadDialog.tsx';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table, type TableSequenceData } from './Table';
import { parseMutationString } from './fields/MutationField.tsx';
import useQueryAsState from './useQueryAsState.js';
import { getLapisUrl } from '../../config.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import { type MetadataFilter, type Schema, type GroupedMetadataFilter, type FieldValues } from '../../types/config.ts';
import { type OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
const orderKey = 'orderBy';
const orderDirectionKey = 'order';

const VISIBILITY_PREFIX = 'visibility_';

interface InnerSearchFullUIProps {
    accessToken?: string;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    myGroups: Group[];
    organism: string;
    clientConfig: ClientConfig;
    schema: Schema;
    hiddenFieldValues?: FieldValues;
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
}: InnerSearchFullUIProps) => {
    if (!hiddenFieldValues) {
        hiddenFieldValues = {};
    }
    const metadataSchema = schema.metadata;

    const metadataSchemaWithExpandedRanges = useMemo(() => {
        const result = [];
        for (const field of metadataSchema) {
            if (field.rangeSearch === true) {
                const fromField = {
                    ...field,
                    name: `${field.name}From`,
                    label: `From`,
                    fieldGroup: field.name,
                    fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
                };
                const toField = {
                    ...field,
                    name: `${field.name}To`,
                    label: `To`,
                    fieldGroup: field.name,
                    fieldGroupDisplayName: field.displayName ?? sentenceCase(field.name),
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

    const orderByField = state.orderBy ?? schema.defaultOrderBy ?? schema.primaryKey;
    const orderDirection = state.order ?? schema.defaultOrder ?? 'ascending';

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

    const visibilities = useMemo(() => {
        const visibilities = new Map<string, boolean>();
        schema.metadata.forEach((field) => {
            if (field.hideOnSequenceDetailsPage === true) {
                return;
            }
            visibilities.set(field.name, field.initiallyVisible === true);
        });

        const visibilityKeys = Object.keys(state).filter((key) => key.startsWith(VISIBILITY_PREFIX));

        for (const key of visibilityKeys) {
            visibilities.set(key.slice(VISIBILITY_PREFIX.length), state[key] === 'true');
        }
        return visibilities;
    }, [schema.metadata, state]);

    const fieldValues = useMemo(() => {
        const fieldKeys = Object.keys(state)
            .filter((key) => !key.startsWith(VISIBILITY_PREFIX))
            .filter((key) => key !== orderKey && key !== orderDirectionKey);

        const values: Record<string, any> = { ...hiddenFieldValues };
        for (const key of fieldKeys) {
            values[key] = state[key];
        }
        return values;
    }, [state, hiddenFieldValues]);

    const setAFieldValue = (fieldName: string, value: string | number) => {
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

    const setAVisibility = (fieldName: string, visible: boolean) => {
        setState((prev: any) => ({
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

    const lapisSearchParameters = useMemo(() => {
        const sequenceFilters = Object.fromEntries(
            Object.entries(fieldValues).filter(([, value]) => value !== undefined && value !== ''),
        );

        if (sequenceFilters.accession !== '' && sequenceFilters.accession !== undefined) {
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
        const OrderByList: OrderBy[] = [
            {
                field: orderByField,
                type: orderDirection,
            },
        ];
        // @ts-expect-error because the hooks don't accept OrderBy
        detailsHook.mutate({
            ...lapisSearchParameters,
            fields: [...schema.tableColumns, schema.primaryKey],
            limit: pageSize,
            offset: (page - 1) * pageSize,
            orderBy: OrderByList,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lapisSearchParameters, schema.tableColumns, schema.primaryKey, pageSize, page, orderByField, orderDirection]);

    const totalSequences = aggregatedHook.data?.data[0].count ?? undefined;

    const [oldData, setOldData] = useState<TableSequenceData[] | null>(null);
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
                    visibilities={visibilities}
                    setAVisibility={setAVisibility}
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
                            The retrieval database is currently initializing, please check back later.
                        </div>
                    ) : (
                        <div className='bg-red-400 p-3 rounded-lg'>
                            <p>There was an error loading the data.</p>
                            <p className='text-xs'>{JSON.stringify(detailsHook.error)}</p>

                            <p>{detailsHook.error?.message}</p>
                            <p>{aggregatedHook.error?.message}</p>
                        </div>
                    ))}
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
                        <div className='text-sm text-gray-800 mb-6 justify-between flex md:px-6 items-baseline'>
                            <div className='mt-auto'>
                                Search returned{' '}
                                {totalSequences !== undefined
                                    ? totalSequences.toLocaleString()
                                    : oldCount !== null
                                      ? oldCount.toLocaleString()
                                      : ''}{' '}
                                sequence
                                {totalSequences === 1 ? '' : 's'}
                                {detailsHook.isLoading || aggregatedHook.isLoading ? (
                                    <span className='loading loading-spinner loading-xs ml-3 appearSlowly'></span>
                                ) : null}
                            </div>

                            <DownloadDialog
                                lapisUrl={lapisUrl}
                                lapisSearchParameters={lapisSearchParameters}
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                                hiddenFieldValues={hiddenFieldValues}
                            />
                        </div>

                        <Table
                            schema={schema}
                            data={
                                detailsHook.data?.data !== undefined
                                    ? (detailsHook.data.data as TableSequenceData[])
                                    : oldData ?? []
                            }
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
