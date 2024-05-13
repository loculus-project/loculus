import CircularProgress from '@mui/material/CircularProgress';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { type FC, type FormEventHandler, useMemo, useState, useCallback } from 'react';

import { CustomizeModal } from './CustomizeModal.tsx';
import { AccessionField } from './fields/AccessionField.tsx';
import { AutoCompleteField, type AutoCompleteFieldProps } from './fields/AutoCompleteField';
import { DateField, TimestampField } from './fields/DateField.tsx';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { PangoLineageField } from './fields/PangoLineageField';
import { getClientLogger } from '../../clientLogger.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import { type ClassOfSearchPageType, navigateToSearchLikePage } from '../../routes/routes.ts';
import type { AccessionFilter, GroupedMetadataFilter, MetadataFilter, MutationFilter } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';
import { getLapisUrl } from '../../config.ts';

const queryClient = new QueryClient();

interface SearchFormProps {
    organism: string;
    filters: MetadataFilter[];
    initialAccessionFilter: AccessionFilter;
    initialMutationFilter: MutationFilter;
    clientConfig: ClientConfig;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    classOfSearchPage: ClassOfSearchPageType;
    groupId?: number;
}

const clientLogger = getClientLogger('SearchForm');

export const SearchForm: FC<SearchFormProps> = ({
    organism,
    metadataFilterWithoutHiddenFilters,
    initialAccessionFilter,
    initialMutationFilter,
    clientConfig,
    referenceGenomesSequenceNames,
    classOfSearchPage,
    groupId,
    allFields,
    fieldValues
}) => {

    const lapisUrl = getLapisUrl(clientConfig, organism);

    const withoutUnsearchable = metadataFilterWithoutHiddenFilters.filter((filter) => !filter.notSearchable);

    const groupedFields = useMemo(() => consolidateGroupedFields(withoutUnsearchable), [withoutUnsearchable]);
    
    return (
        <QueryClientProvider client={queryClient}>
        <div>
            {
                groupedFields.map((filter) => 
                    <p className='border border-gray-300 p-2'>
                        { JSON.stringify(filter) }
                        <SearchField field={filter} 
                        lapisUrl={lapisUrl}
                        allFields={allFields}
                        fieldValues={fieldValues}
                        />
                    </p>

                )
            }

        </div>
        </QueryClientProvider>
    );

}


const SearchField = ({field, lapisUrl, allFields, fieldValues}) => {
    
    field.label = field.label ?? field.displayName ?? sentenceCase(field.name);

    if (field.grouped) {
        return (
            <div className='border border-gray-300 p-2'>
                <h2>{field.displayName}</h2>
                {field.groupedFields.map((f) => (
                    <div>
                    <SearchField field={f} 
                    fieldValues={fieldValues}
                    
                    />
                    { JSON.stringify(f) }
                    </div>
              
                   
                ))}
            </div>
        );
    }


    switch (field.type) {
        case 'date':
            return <div>date</div>
        /*case 'timestamp':
            return <TimestampField {...props} />;
        case 'pango_lineage':
            return <PangoLineageField {...props} />;
            */
        default:
            if (field.autocomplete === true) {
               
                return <AutoCompleteField 
                field={field}
                lapisUrl={lapisUrl}
                allFields={allFields}
                
                
                />
            }
            return <NormalTextField type={field.type} field={field} 
            fieldValue={fieldValues[field.name]}
            
            />;
    }
    
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
