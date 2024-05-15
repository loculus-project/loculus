import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DatePicker } from 'rsuite';

import { CustomizeModal } from './CustomizeModal.tsx';
import { DownloadDialog } from './DownloadDialog/DownloadDialog';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table } from './Table';
import useQueryAsState from './useQueryAsState.js';
import { getLapisUrl } from '../../config.ts';
import { SEARCH } from '../../routes/routes';
import { type ClassOfSearchPageType } from '../../routes/routes.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import {
    metadata,
    type AccessionFilter,
    type MetadataFilter,
    type MutationFilter,
    type Schema,
} from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import type { SearchResponse } from '../../utils/search.ts';

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

    let orderBy; // TODONOW

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
        const fieldKeys = Object.keys(state).filter((key) => !key.startsWith(VISIBILITY_PREFIX));
        const values = {};
        for (const key of fieldKeys) {
            values[key] = state[key];
        }
        return values;
    }, [state]);

    console.log('fieldValues', fieldValues);

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

    useEffect(() => {
        const sequenceFilters = Object.fromEntries(
            Object.entries(fieldValues).filter(([, value]) => value !== undefined && value !== ''),
        );
        console.log('sequenceFilters', sequenceFilters);

        aggregatedHook.mutate({
            ...sequenceFilters,
            fields: [],
            nucleotideMutations: [],
            aminoAcidMutations: [],
            nucleotideInsertions: [],
            aminoAcidInsertions: [],
        });
        detailsHook.mutate({
            ...sequenceFilters,
            fields: [...schema.tableColumns, schema.primaryKey],
            nucleotideMutations: [],
            aminoAcidMutations: [],
            nucleotideInsertions: [],
            aminoAcidInsertions: [],
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
    }, [fieldValues, page]);

    const totalSequences = aggregatedHook.data?.data[0].count ?? undefined;

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
                    classOfSearchPage={SEARCH}
                    fieldValues={fieldValues}
                    setAFieldValue={setAFieldValue}
                    consolidatedMetadataSchema={consolidatedMetadataSchema}
                    lapisUrl={lapisUrl}
                    visibilities={visibilities}
                    setAVisibility={setAVisibility}
                />
            </div>
            <div className='flex-1'>
                <RecentSequencesBanner organism={organism} />
                {aggregatedHook.isLoading ? (
                    <p>Loading...</p>
                ) : aggregatedHook.error ? (
                    <p>Error: {aggregatedHook.error.message}</p>
                ) : (
                    <div>
                        {totalSequences && (
                            <div className='mt-auto'>
                                Search returned {totalSequences.toLocaleString()} sequence
                                {totalSequences === 1 ? '' : 's'}
                            </div>
                        )}

                        {detailsHook.data && (
                            <Table
                                schema={schema}
                                data={detailsHook.data.data}
                                setPreviewedSeqId={setPreviewedSeqId}
                                previewedSeqId={previewedSeqId}
                                orderBy={
                                    {
                                        field: 'name',
                                        type: 'ascending',
                                    } as OrderBy
                                }
                            />
                        )}
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

export const SearchFullUI = (props: ClassOfSearchPageType) => {
    const queryClient = new QueryClient();

    return (
        <QueryClientProvider client={queryClient}>
            <InnerSearchFullUI {...props} />
        </QueryClientProvider>
    );
};
