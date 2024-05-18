import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import {  useState } from 'react';

import { CustomizeModal } from './CustomizeModal.tsx';
import { AccessionField } from './fields/AccessionField.tsx';
import { AutoCompleteField, type AutoCompleteFieldProps } from './fields/AutoCompleteField';
import { DateField, TimestampField } from './fields/DateField.tsx';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { getClientLogger } from '../../clientLogger.ts';
import type {  GroupedMetadataFilter } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';



const queryClient = new QueryClient();

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
    setAVisibility,
    referenceGenomesSequenceNames
}) => {
    const visibleFields = consolidatedMetadataSchema.filter((field) => visibilities.get(field.name));

    const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
    const toggleCustomizeModal = () => setIsCustomizeModalOpen(!isCustomizeModalOpen);
    

    return (
        <QueryClientProvider client={queryClient}>
            <div
                className={`${
                    false ? 'translate-y-0' : 'translate-y-full'
                } fixed bottom-0 left-0 w-full bg-white h-4/5 rounded-t-lg overflow-auto offCanvasTransform
                      md:translate-y-0 md:static md:h-auto md:overflow-visible md:min-w-72`}
            >
                <div className='shadow-xl rounded-r-lg px-4 pt-4'>
                    <div className='flex'>
                        <h2 className='text-lg font-semibold flex-1 md:hidden'>Search query</h2>
                        <div className='flex items-center justify-between w-full mb-2 text-primary-700'>
                            <button className='underline' onClick={toggleCustomizeModal}>
                                Customize fields
                            </button>
                        </div>{' '}
                    </div>
                    <CustomizeModal
                        isCustomizeModalOpen={isCustomizeModalOpen}
                        toggleCustomizeModal={toggleCustomizeModal}
                        alwaysPresentFieldNames={[]}
                        visibilities={visibilities}
                        setAVisibility={setAVisibility}
                    />
                    <div className='flex flex-col'>
                    <AccessionField 
                    textValue={fieldValues.accession}
                    setTextValue={(value) => setAFieldValue('accession', value)}
                    
                    
                    />
                    
                  
                        <MutationField 
                    referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                    value={fieldValues.mutation ?? ''}
                    onChange={(value) => setAFieldValue('mutation', value)}
                     
                   
                    />
                    
                        {visibleFields.map((filter) => (
                            <SearchField
                                field={filter}
                                lapisUrl={lapisUrl}
                                fieldValues={fieldValues}
                                setAFieldValue={setAFieldValue}
                                key={filter.name}
                            />
                        ))}
                    </div>{' '}
                </div>
            </div>
        </QueryClientProvider>
    );
};

const SearchField = ({ field, lapisUrl, fieldValues, setAFieldValue }) => {
   
    field.label = field.label ?? field.displayName ?? sentenceCase(field.name);

    if (field.grouped) {
        return (
            <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
                <h3 className='text-gray-500 text-sm mb-1'>
                    {field.displayName !== undefined ? field.displayName : field.label}
                </h3>

                {field.groupedFields.map((f) => (
                    <SearchField field={f} fieldValues={fieldValues} setAFieldValue={setAFieldValue} key={f.name} />
                ))}
            </div>
        );
    }

    switch (field.type) {
        case 'date':
            return <DateField field={field} fieldValue={fieldValues[field.name]} setAFieldValue={setAFieldValue} />;
        /* case 'timestamp':
            return <TimestampField {...props} />;
*/
        default:
            if (field.autocomplete === true) {
                return (
                    <AutoCompleteField
                        field={field}
                        lapisUrl={lapisUrl}
                        allFields={fieldValues}
                        setAFieldValue={setAFieldValue}
                        fieldValue={fieldValues[field.name]}
                    />
                );
            }
            return (
                <NormalTextField
                    type={field.type}
                    field={field}
                    fieldValue={fieldValues[field.name]}
                    setAFieldValue={setAFieldValue}
                />
            );
    }
};
