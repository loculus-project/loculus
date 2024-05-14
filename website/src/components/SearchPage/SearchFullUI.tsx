import { useEffect, useState } from 'react';

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
import { metadata, type AccessionFilter, type MetadataFilter, type MutationFilter, type Schema } from '../../types/config.ts';
import type { OrderBy } from '../../types/lapis.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import type { SearchResponse } from '../../utils/search.ts';
import useQueryAsState from './useQueryAsState.js';
import { getLapisUrl } from '../../config.ts';
import { lapisClientHooks } from '../../services/serviceHooks.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';


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
  schema
}: InnerSearchFullUIProps) => {
    const metadataSchema = schema.metadata;
   
  const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);
  const [previewHalfScreen, setPreviewHalfScreen] = useState(false);
  const [fieldValues, setFieldValues] = useQueryAsState({});
  const setAFieldValue = (fieldName: string, value: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const lapisUrl = getLapisUrl(clientConfig, organism);

  const consolidatedMetadataSchema = consolidateGroupedFields(metadataSchema);

  const hooks = lapisClientHooks(lapisUrl).zodiosHooks;
  const aggregatedHook = hooks.useAggregated({},{}); 
  const detailsHook = hooks.useDetails({},{});

  console.log("referenceGenomeSequenceNames", referenceGenomesSequenceNames);

 

  useEffect(() => {
    aggregatedHook.mutate({ fields: [], nucleotideMutations: [], aminoAcidMutations: [], nucleotideInsertions: [], aminoAcidInsertions: [] });
    detailsHook.mutate({ fields: [...schema.tableColumns, schema.primaryKey
    ], nucleotideMutations: [], aminoAcidMutations: [], nucleotideInsertions: [], aminoAcidInsertions: [] ,
        limit: pageSize, offset: 0 });
    }, [fieldValues]);

    

  return (
    <div className='flex flex-col md:flex-row gap-8 md:gap-4'>
      <SeqPreviewModal
        seqId={previewedSeqId ?? ''}
        accessToken={accessToken}
        isOpen={previewedSeqId !== null}
        onClose={() => setPreviewedSeqId(null)}
        referenceGenomeSequenceNames={referenceGenomesSequenceNames}
        myGroups={[]
            //TODONOW


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
          
        />
        
      </div>
      <div className='flex-1'>
        {aggregatedHook.isLoading ? (
          <p>Loading...</p>
        ) : aggregatedHook.error ? (
          <p>Error: {aggregatedHook.error.message}</p>
        ) : (
        <p>as
            {
               detailsHook.data &&
            
             <Table
                schema={schema}
                data={detailsHook.data.data}
                setPreviewedSeqId={setPreviewedSeqId}
                previewedSeqId={previewedSeqId}
                orderBy={{
                    field: 'name',
                    type: 'ascending',
                    } as OrderBy}
                
            
            />
}
        </p>
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
