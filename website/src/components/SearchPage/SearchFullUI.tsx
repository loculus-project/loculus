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
    metadataFilter: MetadataFilter[];
    accessionFilter: AccessionFilter;
    mutationFilter: MutationFilter;
    metadataFilterWithoutHiddenFilters: MetadataFilter[];
    page: number;
    data: SearchResponse | null;
    error: null | { message: string };
}

export const SearchFullUI = ({
    organism,
    data,
    page,
    metadataFilter,
    metadataFilterWithoutHiddenFilters,
    accessionFilter,
    mutationFilter,
    lapisUrl,
    referenceGenomesSequenceNames,
    schema,
    clientConfig,
    orderBy,
    error,
    classOfSearchPage,
}: SearchFullUIProps) => {
    const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);

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
                accessToken={undefined}
                isOpen={previewedSeqId !== null}
                onClose={() => setPreviewedSeqId(null)}
            />
            <div className='md:w-72'>
                <SearchForm
                    organism={organism}
                    filters={metadataFilter}
                    initialAccessionFilter={accessionFilter}
                    initialMutationFilter={mutationFilter}
                    clientConfig={clientConfig}
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    classOfSearchPage={SEARCH}
                />
            </div>
            <div className='flex-1'>
                <RecentSequencesBanner organism={organism} />
                <div className=' text-sm text-gray-800 mb-6 justify-between flex px-6 items-baseline'>
                    <div className='mt-auto'>
                        Search returned {data.totalCount.toLocaleString()} sequence{data.totalCount === 1 ? '' : 's'}
                    </div>
                    <div>
                        {classOfSearchPage === SEARCH && (
                            <DownloadDialog
                                metadataFilter={metadataFilterWithoutHiddenFilters}
                                mutationFilter={mutationFilter}
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                                lapisUrl={lapisUrl}
                            />
                        )}
                    </div>
                </div>
                <Table
                    organism={organism}
                    data={data.data}
                    schema={schema}
                    metadataFilter={metadataFilter}
                    accessionFilter={accessionFilter}
                    mutationFilter={mutationFilter}
                    page={page}
                    orderBy={orderBy}
                    classOfSearchPage={SEARCH}
                    setPreviewedSeqId={setPreviewedSeqId}
                />
                <div className='mt-4 flex justify-center'>
                    <SearchPagination
                        count={Math.ceil(data.totalCount / pageSize)}
                        page={page}
                        metadataFilter={metadataFilter}
                        accessionFilter={accessionFilter}
                        mutationFilter={mutationFilter}
                        orderBy={orderBy}
                        organism={organism}
                        classOfSearchPage={SEARCH}
                    />
                </div>
            </div>
        </div>
    );
};
