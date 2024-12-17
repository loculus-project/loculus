import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { useState } from 'react';

import { CustomizeModal } from './CustomizeModal.tsx';
import { AccessionField } from './fields/AccessionField.tsx';
import { AutoCompleteField } from './fields/AutoCompleteField';
import { DateField, TimestampField } from './fields/DateField.tsx';
import { DateRangeField } from './fields/DateRangeField.tsx';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { searchFormHelpDocsUrl } from './searchFormHelpDocsUrl.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas.ts';
import type { GroupedMetadataFilter, MetadataFilter, FieldValues, SetSomeFieldValues } from '../../types/config.ts';
import { type ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { OffCanvasOverlay } from '../OffCanvasOverlay.tsx';
import MaterialSymbolsHelpOutline from '~icons/material-symbols/help-outline';
import MaterialSymbolsResetFocus from '~icons/material-symbols/reset-focus';
import StreamlineWrench from '~icons/streamline/wrench';

const queryClient = new QueryClient();

interface SearchFormProps {
    organism: string;
    consolidatedMetadataSchema: (GroupedMetadataFilter | MetadataFilter)[];
    clientConfig: ClientConfig;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    searchVisibilities: Map<string, boolean>;
    setASearchVisibility: (fieldName: string, value: boolean) => void;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    lapisSearchParameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451) use `unknown`or proper types
}

export const SearchForm = ({
    consolidatedMetadataSchema,
    fieldValues,
    setSomeFieldValues,
    lapisUrl,
    searchVisibilities,
    setASearchVisibility,
    referenceGenomesSequenceNames,
    lapisSearchParameters,
}: SearchFormProps) => {
    const visibleFields = consolidatedMetadataSchema.filter((field) => searchVisibilities.get(field.name));

    const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
    const { isOpen: isMobileOpen, close: closeOnMobile, toggle: toggleMobileOpen } = useOffCanvas();
    const toggleCustomizeModal = () => setIsCustomizeModalOpen(!isCustomizeModalOpen);

    return (
        <QueryClientProvider client={queryClient}>
            <div className='text-right -mb-10 md:hidden'>
                <button onClick={toggleMobileOpen} className='btn btn-xs bg-primary-600 text-white'>
                    Modify search query
                </button>
            </div>
            {isMobileOpen && <OffCanvasOverlay className='md:hidden' onClick={closeOnMobile} />}
            <div
                className={`${
                    isMobileOpen ? 'translate-y-0' : 'translate-y-full'
                } fixed bottom-0 left-0 w-full bg-white h-4/5 rounded-t-lg overflow-auto offCanvasTransform
                      md:translate-y-0 md:static md:h-auto md:overflow-visible md:min-w-72`}
            >
                <div className='shadow-xl rounded-r-lg px-4 pt-4'>
                    <h2 className='text-lg font-semibold flex-1 md:hidden mb-2'>Search query</h2>
                    <div className='flex'>
                        <div className='flex items-center justify-between w-full mb-1 text-primary-700'>
                            <div className='flex items-center justify-between w-full mb-1 text-primary-700 text-sm'>
                                <button className='hover:underline' onClick={toggleCustomizeModal}>
                                    <StreamlineWrench className='inline-block' /> Add Search Fields
                                </button>
                                <button
                                    className='hover:underline'
                                    onClick={() => {
                                        window.location.href = './';
                                    }}
                                >
                                    <MaterialSymbolsResetFocus className='inline-block' /> Reset
                                </button>
                                <a href={searchFormHelpDocsUrl} target='_blank'>
                                    <MaterialSymbolsHelpOutline className='inline-block' /> Help
                                </a>
                            </div>
                        </div>{' '}
                    </div>
                    <CustomizeModal
                        thingToCustomize='search field'
                        isCustomizeModalOpen={isCustomizeModalOpen}
                        toggleCustomizeModal={toggleCustomizeModal}
                        alwaysPresentFieldNames={[]}
                        visibilities={searchVisibilities}
                        setAVisibility={setASearchVisibility}
                        nameToLabelMap={consolidatedMetadataSchema.reduce(
                            (acc, field) => {
                                acc[field.name] = field.displayName ?? field.label ?? sentenceCase(field.name);
                                return acc;
                            },
                            {} as Record<string, string>,
                        )}
                    />
                    <div className='flex flex-col'>
                        <AccessionField
                            textValue={fieldValues.accession as string}
                            setTextValue={(value) => setSomeFieldValues(['accession', value])}
                        />

                        <MutationField
                            referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                            value={'mutation' in fieldValues ? (fieldValues.mutation as string) : ''}
                            onChange={(value) => setSomeFieldValues(['mutation', value])}
                        />
                        {visibleFields.map((filter) => (
                            <SearchField
                                field={filter}
                                lapisUrl={lapisUrl}
                                fieldValues={fieldValues}
                                setSomeFieldValues={setSomeFieldValues}
                                key={filter.name}
                                lapisSearchParameters={lapisSearchParameters}
                            />
                        ))}
                    </div>{' '}
                </div>
            </div>
        </QueryClientProvider>
    );
};

interface SearchFieldProps {
    field: GroupedMetadataFilter | MetadataFilter;
    lapisUrl: string;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisSearchParameters: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- TODO(#3451) use `unknown`or proper types
}

const SearchField = ({ field, lapisUrl, fieldValues, setSomeFieldValues, lapisSearchParameters }: SearchFieldProps) => {
    field.label = field.label ?? field.displayName ?? sentenceCase(field.name);

    if (field.grouped === true) {
        if (field.groupedFields[0].rangeOverlapSearch) {
            return <DateRangeField field={field} fieldValues={fieldValues} setSomeFieldValues={setSomeFieldValues} />;
        } else {
            return (
                <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
                    <h3 className='text-gray-500 text-sm mb-1'>{field.displayName ?? field.label}</h3>

                    {field.groupedFields.map((f) => (
                        <SearchField
                            field={f}
                            fieldValues={fieldValues}
                            setSomeFieldValues={setSomeFieldValues}
                            key={f.name}
                            lapisSearchParameters={lapisSearchParameters}
                            lapisUrl={lapisUrl}
                        />
                    ))}
                </div>
            );
        }
    }

    switch (field.type) {
        case 'date':
            return (
                <DateField
                    field={field}
                    fieldValue={fieldValues[field.name] ?? ''}
                    setSomeFieldValues={setSomeFieldValues}
                />
            );
        case 'timestamp':
            return (
                <TimestampField
                    field={field}
                    fieldValue={fieldValues[field.name] ?? ''}
                    setSomeFieldValues={setSomeFieldValues}
                />
            );

        default:
            if (field.autocomplete === true) {
                return (
                    <AutoCompleteField
                        field={field}
                        lapisUrl={lapisUrl}
                        setSomeFieldValues={setSomeFieldValues}
                        fieldValue={fieldValues[field.name] ?? ''}
                        lapisSearchParameters={lapisSearchParameters}
                    />
                );
            }
            return (
                <NormalTextField
                    type={field.type}
                    field={field}
                    fieldValue={fieldValues[field.name] ?? ''}
                    setSomeFieldValues={setSomeFieldValues}
                />
            );
    }
};
