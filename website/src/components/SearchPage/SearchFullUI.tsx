import { useState } from 'react';

import { DownloadDialog } from './DownloadDialog/DownloadDialog';
import { RecentSequencesBanner } from './RecentSequencesBanner.tsx';
import { SearchForm } from './SearchForm';
import { SearchPagination } from './SearchPagination';
import { SeqPreviewModal } from './SeqPreviewModal';
import { Table } from './Table';
import { SEARCH } from '../../routes/routes';
import { type ClassOfSearchPageType } from '../../routes/routes.ts';
import { pageSize } from '../../settings';
import type { Group } from '../../types/backend.ts';
import type { AccessionFilter, MetadataFilter, MutationFilter, Schema } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import type { SearchResponse } from '../../utils/search.ts';

interface SearchFullUIProps {
    organism: string;
    filters: MetadataFilter[];
    initialAccessionFilter: AccessionFilter;
    initialMutationFilter: MutationFilter;
    clientConfig: ClientConfig;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    classOfSearchPage: ClassOfSearchPageType;
    groupId?: number;
    orderBy: OrderBy;
    lapisUrl: string;
    schema: Schema;
    accessionFilter: AccessionFilter;
    mutationFilter: MutationFilter;
    initialMetadataFilterWithoutHiddenFilters: MetadataFilter[];
    hiddenSearchFeatures: MetadataFilter[];
    page: number;
    data: SearchResponse | null;
    error: null | { message: string };
    myGroups: Group[];
    accessToken: string | undefined;
}

export const SearchFullUI = ({
    organism,
    data,
    page,
    accessionFilter,
    mutationFilter,
    lapisUrl,
    referenceGenomesSequenceNames,
    schema,
    clientConfig,
    orderBy,
    error,
    classOfSearchPage,
    myGroups,
    accessToken,
    initialMetadataFilterWithoutHiddenFilters,
    hiddenSearchFeatures,
}: SearchFullUIProps) => {
    const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);
    const [previewHalfScreen, setPreviewHalfScreen] = useState(false);
    const [metadataFilterWithoutHiddenFilters, setMetadataFilterWithoutHiddenFilters] = useState<MetadataFilter[]>(initialMetadataFilterWithoutHiddenFilters);
    const [fieldValues, setFieldValues] = useState({}); 
    const allFields = []

    if (error !== null) {
        return (
            <div className='bg-red-100 p-4 text-red-900'>
                <div className='text-lg font-bold'>Error</div>
                {error.message}
            </div>
        );
    }

    data = data as SearchResponse;

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
            />
            <div className='md:w-72'>
                <SearchForm
                    organism={organism}
                    metadataFilterWithoutHiddenFilters={metadataFilterWithoutHiddenFilters}
                    setMetadataFilterWithoutHiddenFilters={setMetadataFilterWithoutHiddenFilters}
                    initialAccessionFilter={accessionFilter}
                    initialMutationFilter={mutationFilter}
                    clientConfig={clientConfig}
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    classOfSearchPage={SEARCH}
                    fieldValues={fieldValues}
                />
            </div>
        
        </div>
    );
};
