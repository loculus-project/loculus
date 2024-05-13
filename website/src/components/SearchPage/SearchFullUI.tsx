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
import useQueryAsState from './useQueryAsState.js';


export const SearchFullUI = (
    {metadataSchema,
        accessToken,
        referenceGenomesSequenceNames,
        myGroups,
        organism,
        clientConfig

    }



) => {
    const [previewedSeqId, setPreviewedSeqId] = useState<string | null>(null);
    const [previewHalfScreen, setPreviewHalfScreen] = useState(false);
   
    const [fieldValues, setFieldValues] = useQueryAsState({})
    const setAFieldValue = (fieldName: string, value: string) => {
        setFieldValues(
            (prev) => ({
                ...prev,
                [fieldName]: value,
            })
        );
    }

    const consolidatedMetadataSchema = consolidateGroupedFields(metadataSchema)

    console.log("fieldVal", fieldValues)


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
                    
                  
                    clientConfig={clientConfig}
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    classOfSearchPage={SEARCH}
                    fieldValues={fieldValues}
                    setAFieldValue={setAFieldValue}
                    consolidatedMetadataSchema={consolidatedMetadataSchema}
                />
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
