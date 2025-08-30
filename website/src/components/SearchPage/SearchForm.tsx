import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { useState } from 'react';

import { OffCanvasOverlay } from '../OffCanvasOverlay.tsx';
import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { AccessionField } from './fields/AccessionField.tsx';
import { AutoCompleteField } from './fields/AutoCompleteField';
import { DateField, TimestampField } from './fields/DateField.tsx';
import { DateRangeField } from './fields/DateRangeField.tsx';
import { LineageField } from './fields/LineageField.tsx';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { searchFormHelpDocsUrl } from './searchFormHelpDocsUrl.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas.ts';
import type { GroupedMetadataFilter, MetadataFilter, FieldValues, SetSomeFieldValues } from '../../types/config.ts';
import { type ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import DisabledUntilHydrated from '../DisabledUntilHydrated';
import { FieldSelectorModal, type FieldItem } from '../common/FieldSelectorModal.tsx';
import MaterialSymbolsHelpOutline from '~icons/material-symbols/help-outline';
import MaterialSymbolsResetFocus from '~icons/material-symbols/reset-focus';
import StreamlineWrench from '~icons/streamline/wrench';

const queryClient = new QueryClient();

interface SearchFormProps {
    organism: string;
    filterSchema: MetadataFilterSchema;
    clientConfig: ClientConfig;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    searchVisibilities: Map<string, boolean>;
    setASearchVisibility: (fieldName: string, value: boolean) => void;
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    lapisSearchParameters: LapisSearchParameters;
    showMutationSearch: boolean;
}

export const SearchForm = ({
    filterSchema,
    fieldValues,
    setSomeFieldValues,
    lapisUrl,
    searchVisibilities,
    setASearchVisibility,
    referenceGenomesSequenceNames,
    lapisSearchParameters,
    showMutationSearch,
}: SearchFormProps) => {
    const visibleFields = filterSchema.filters.filter((field) => searchVisibilities.get(field.name));

    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const { isOpen: isMobileOpen, close: closeOnMobile, toggle: toggleMobileOpen } = useOffCanvas();
    const toggleFieldSelector = () => setIsFieldSelectorOpen(!isFieldSelectorOpen);

    const fieldItems: FieldItem[] = filterSchema.filters
        .filter((filter) => filter.name !== 'accession') // Exclude accession field
        .map((filter) => ({
            name: filter.name,
            displayName: filter.displayName ?? sentenceCase(filter.name),
            header: filter.header,
        }));

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
                                <DisabledUntilHydrated>
                                    <button className='hover:underline' onClick={toggleFieldSelector}>
                                        <StreamlineWrench className='inline-block' /> Add search fields
                                    </button>
                                </DisabledUntilHydrated>
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
                    <FieldSelectorModal
                        title='Add search fields'
                        isOpen={isFieldSelectorOpen}
                        onClose={toggleFieldSelector}
                        fields={fieldItems}
                        selectedFields={
                            new Set(
                                Array.from(searchVisibilities.entries())
                                    .filter(([_, visible]) => visible)
                                    .map(([field]) => field),
                            )
                        }
                        setFieldSelected={setASearchVisibility}
                    />
                    <div className='flex flex-col'>
                        <div className='mb-1'>
                            <AccessionField
                                textValue={'accession' in fieldValues ? fieldValues.accession! : ''}
                                setTextValue={(value) => setSomeFieldValues(['accession', value])}
                            />
                        </div>

                        {showMutationSearch && (
                            <MutationField
                                referenceGenomesSequenceNames={referenceGenomesSequenceNames}
                                value={'mutation' in fieldValues ? fieldValues.mutation! : ''}
                                onChange={(value) => setSomeFieldValues(['mutation', value])}
                            />
                        )}
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
    lapisSearchParameters: LapisSearchParameters;
}

const SearchField = ({ field, lapisUrl, fieldValues, setSomeFieldValues, lapisSearchParameters }: SearchFieldProps) => {
    if (field.grouped === true) {
        if (field.groupedFields[0].rangeOverlapSearch) {
            return <DateRangeField field={field} fieldValues={fieldValues} setSomeFieldValues={setSomeFieldValues} />;
        } else {
            return (
                <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
                    <h3 className='text-gray-500 text-sm mb-1'>{field.displayName ?? field.name}</h3>

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
            if (field.lineageSearch) {
                return (
                    <LineageField
                        field={field}
                        fieldValue={(fieldValues[field.name] ?? '') as string}
                        setSomeFieldValues={setSomeFieldValues}
                        lapisUrl={lapisUrl}
                        lapisSearchParameters={lapisSearchParameters}
                    />
                );
            }
            if (field.autocomplete === true) {
                return (
                    <AutoCompleteField
                        field={field}
                        fieldValue={field.name in fieldValues ? fieldValues[field.name] : ''}
                        setSomeFieldValues={setSomeFieldValues}
                        optionsProvider={{
                            type: 'generic',
                            lapisUrl,
                            lapisSearchParameters,
                            fieldName: field.name,
                        }}
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
