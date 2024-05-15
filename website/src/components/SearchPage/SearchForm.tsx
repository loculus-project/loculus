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


const clientLogger = getClientLogger('SearchForm');

interface SearchFormProps {
    organism: string;
    metadataSchema: GroupedMetadataFilter[];
    clientConfig: ClientConfig;
    fieldValues: Record<string, string>;
    setAFieldValue: (fieldName: string, value: string) => void;
    lapisUrl: string;
    visibilities: Map<string, boolean>;
    setAVisibility: (fieldName: string, value: boolean) => void;
}


export const SearchForm = ({
    organism,
   
    consolidatedMetadataSchema,
    clientConfig,
    fieldValues,
    setAFieldValue,
    lapisUrl,
    visibilities,
    setAVisibility

}) => {

  

    const visibleFields = consolidatedMetadataSchema.filter((field) => visibilities.get(field.name));

    const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
    const toggleCustomizeModal = () => setIsCustomizeModalOpen(!isCustomizeModalOpen);


    return (
        <QueryClientProvider client={queryClient}>
        <div>
        <button className='underline'
                            onClick={toggleCustomizeModal}
                            >
                                Customize fields
                            </button>
                         
                         {

                           <CustomizeModal
                isCustomizeModalOpen={isCustomizeModalOpen}
                toggleCustomizeModal={toggleCustomizeModal}
                alwaysPresentFieldNames={[]}
                visibilities={visibilities}
                setAVisibility={setAVisibility}
            />
                            }
                         

            {
                visibleFields.map((filter) => 
                    <div className='border border-gray-300 p-2' key={filter.name}>
                      <span className='text-xs leading-4'>
                          { JSON.stringify(filter) }</span>
                        valuer: {
                            fieldValues[filter.name]
                        }
                        <SearchField field={filter} 
                        lapisUrl={lapisUrl}
                        fieldValues={fieldValues}
                        setAFieldValue={setAFieldValue}
                        />
                    </div>

                )
            }

        </div>
        </QueryClientProvider>
    );

}


const SearchField = ({field, lapisUrl, allFields, fieldValues, setAFieldValue}) => {
    
    field.label = field.label ?? field.displayName ?? sentenceCase(field.name);

    if (field.grouped) {
        return (
            <div className='border border-gray-300 p-2'>
                <h2>{field.displayName}</h2>
                {field.groupedFields.map((f) => (
                    <div>
                    <SearchField field={f} 
                    fieldValues={fieldValues}
                    setAFieldValue={setAFieldValue}
                    
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
*/
        default:
            if (field.autocomplete === true) {
               
                // TODONOW: do autocompletion
                "pass"
            }
            return <NormalTextField type={field.type} field={field} 
            fieldValue={fieldValues[field.name]}
            
            setAFieldValue={setAFieldValue}
            
            
            />;
    }
    
};
