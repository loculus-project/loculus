import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { useMemo, useState } from 'react';

import { OffCanvasOverlay } from '../OffCanvasOverlay.tsx';
import { Button } from '../common/Button';
import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { ReferenceSelector } from './ReferenceSelector.tsx';
import { getDisplayState } from './TableColumnSelectorModal.tsx';
import { AccessionField } from './fields/AccessionField.tsx';
import { DateField, TimestampField } from './fields/DateField.tsx';
import { DateRangeField } from './fields/DateRangeField.tsx';
import { LineageField } from './fields/LineageField.tsx';
import { MultiChoiceAutoCompleteField } from './fields/MultiChoiceAutoCompleteField';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { searchFormHelpDocsUrl } from './searchFormHelpDocsUrl.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas.ts';
import { ACCESSION_FIELD, IS_REVOCATION_FIELD, VERSION_STATUS_FIELD } from '../../settings.ts';
import type { FieldValues, GroupedMetadataFilter, MetadataFilter, SetSomeFieldValues } from '../../types/config.ts';
import { ReferenceGenomesMap } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { extractArrayValue, validateSingleValue } from '../../utils/extractFieldValue.ts';
import { getSegmentAndGeneInfo } from '../../utils/getSegmentAndGeneInfo.tsx';
import { type MetadataFilterSchema, MetadataVisibility, MUTATION_KEY } from '../../utils/search.ts';
import { BaseDialog } from '../common/BaseDialog.tsx';
import { type FieldItem, FieldSelectorModal } from '../common/FieldSelectorModal.tsx';
import MaterialSymbolsHelpOutline from '~icons/material-symbols/help-outline';
import MaterialSymbolsResetFocus from '~icons/material-symbols/reset-focus';
import MaterialSymbolsTune from '~icons/material-symbols/tune';
import StreamlineWrench from '~icons/streamline/wrench';

const queryClient = new QueryClient();

interface SearchFormProps {
    organism: string;
    filterSchema: MetadataFilterSchema;
    clientConfig: ClientConfig;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    searchVisibilities: Map<string, MetadataVisibility>;
    setASearchVisibility: (fieldName: string, value: boolean) => void;
    referenceGenomesMap: ReferenceGenomesMap;
    lapisSearchParameters: LapisSearchParameters;
    showMutationSearch: boolean;
    referenceIdentifierField: string | undefined;
    setSelectedReferences: (newValues: Record<string, string | null>) => void;
    selectedReferences: Record<string, string | null>;
}

export const SearchForm = ({
    filterSchema,
    fieldValues,
    setSomeFieldValues,
    lapisUrl,
    searchVisibilities,
    setASearchVisibility,
    referenceGenomesMap,
    lapisSearchParameters,
    showMutationSearch,
    referenceIdentifierField,
    setSelectedReferences,
    selectedReferences,
}: SearchFormProps) => {
    const visibleFields = filterSchema.filters.filter(
        (field) => searchVisibilities.get(field.name)?.isVisible(selectedReferences) ?? false,
    );

    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
    const { isOpen: isMobileOpen, close: closeOnMobile, toggle: toggleMobileOpen } = useOffCanvas();
    const toggleFieldSelector = () => setIsFieldSelectorOpen(!isFieldSelectorOpen);
    const closeAdvancedOptions = () => setIsAdvancedOptionsOpen(false);
    const openAdvancedOptions = () => setIsAdvancedOptionsOpen(true);

    const advancedOptionsFields = useMemo(() => {
        const targets = [VERSION_STATUS_FIELD, IS_REVOCATION_FIELD];
        const found = new Map<string, MetadataFilter>();

        const collectField = (filter: GroupedMetadataFilter | MetadataFilter) => {
            if (filter.grouped === true) {
                filter.groupedFields.forEach(collectField);
                return;
            }

            if (targets.includes(filter.name)) {
                found.set(filter.name, filter);
            }
        };

        filterSchema.filters.forEach(collectField);

        return targets.map((name) => found.get(name)).filter((field): field is MetadataFilter => field !== undefined);
    }, [filterSchema]);

    const fieldItems: FieldItem[] = filterSchema.filters
        .filter((filter) => filter.name !== ACCESSION_FIELD) // Exclude accession field
        .filter((filter) => filter.name !== referenceIdentifierField)
        .filter((filter) => !filter.notSearchable)
        .map((filter) => ({
            name: filter.name,
            displayName: filter.displayName ?? sentenceCase(filter.name),
            header: filter.header,
            displayState: getDisplayState(filter, selectedReferences, referenceIdentifierField),
            isChecked: searchVisibilities.get(filter.name)?.isChecked ?? false,
        }));

    const suborganismSegmentAndGeneInfo = useMemo(
        () => getSegmentAndGeneInfo(referenceGenomesMap, selectedReferences),
        [referenceGenomesMap, selectedReferences],
    );

    return (
        <QueryClientProvider client={queryClient}>
            <div className='text-right -mb-10 md:hidden'>
                <Button onClick={toggleMobileOpen} className='btn btn-xs bg-primary-600 text-white'>
                    Modify search query
                </Button>
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
                    <div className='flex flex-col gap-2 mb-2 pb-2 px-3 text-primary-700 text-sm border-b border-gray-300'>
                        <div className='flex items-center justify-between'>
                            <Button className='hover:underline' onClick={toggleFieldSelector}>
                                <StreamlineWrench className='inline-block' /> Add search fields
                            </Button>
                            <a href={searchFormHelpDocsUrl} target='_blank'>
                                <MaterialSymbolsHelpOutline className='inline-block' /> Help
                            </a>
                        </div>
                        <div className='flex items-center justify-between'>
                            {advancedOptionsFields.length > 0 && (
                                <Button className='hover:underline' onClick={openAdvancedOptions}>
                                    <MaterialSymbolsTune className='inline-block' /> Advanced options
                                </Button>
                            )}
                            <Button
                                className='hover:underline'
                                onClick={() => {
                                    window.location.href = './';
                                }}
                            >
                                <MaterialSymbolsResetFocus className='inline-block' /> Reset
                            </Button>
                        </div>
                    </div>
                    <FieldSelectorModal
                        title='Add search fields'
                        isOpen={isFieldSelectorOpen}
                        onClose={toggleFieldSelector}
                        fields={fieldItems}
                        setFieldSelected={setASearchVisibility}
                    />
                    <AdvancedOptionsModal
                        isOpen={isAdvancedOptionsOpen}
                        onClose={closeAdvancedOptions}
                        fields={advancedOptionsFields}
                        fieldValues={fieldValues}
                        setSomeFieldValues={setSomeFieldValues}
                        lapisUrl={lapisUrl}
                        lapisSearchParameters={lapisSearchParameters}
                    />
                    <div className='flex flex-col'>
                        {referenceIdentifierField !== undefined && (
                            <ReferenceSelector
                                filterSchema={filterSchema}
                                referenceGenomesMap={referenceGenomesMap}
                                referenceIdentifierField={referenceIdentifierField}
                                selectedReferences={selectedReferences}
                                setSelectedReferences={setSelectedReferences}
                            />
                        )}
                        <div className='mb-1'>
                            <AccessionField
                                textValue={'accession' in fieldValues ? fieldValues.accession! : ''}
                                setTextValue={(value) => setSomeFieldValues(['accession', value])}
                            />
                        </div>

                        {showMutationSearch && (
                            <MutationField
                                suborganismSegmentAndGeneInfo={suborganismSegmentAndGeneInfo}
                                value={'mutation' in fieldValues ? fieldValues.mutation! : ''}
                                onChange={(value) => setSomeFieldValues([MUTATION_KEY, value])}
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
                    </div>
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
                    fieldValue={validateSingleValue(fieldValues[field.name], field.name)}
                    setSomeFieldValues={setSomeFieldValues}
                />
            );
        case 'timestamp':
            return (
                <TimestampField
                    field={field}
                    fieldValue={validateSingleValue(fieldValues[field.name], field.name)}
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
                const fieldValuesArray = extractArrayValue(fieldValues[field.name]);

                return (
                    <MultiChoiceAutoCompleteField
                        field={field}
                        fieldValues={fieldValuesArray}
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
                    fieldValue={validateSingleValue(fieldValues[field.name], field.name)}
                    setSomeFieldValues={setSomeFieldValues}
                />
            );
    }
};

interface AdvancedOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    fields: MetadataFilter[];
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    lapisUrl: string;
    lapisSearchParameters: LapisSearchParameters;
}

const AdvancedOptionsModal = ({
    isOpen,
    onClose,
    fields,
    fieldValues,
    setSomeFieldValues,
    lapisUrl,
    lapisSearchParameters,
}: AdvancedOptionsModalProps) => {
    if (fields.length === 0) {
        return null;
    }

    return (
        <BaseDialog title='Advanced options' isOpen={isOpen} onClose={onClose}>
            <div className='space-y-4'>
                {fields.map((field) => (
                    <div key={field.name}>
                        <SearchField
                            field={field}
                            fieldValues={fieldValues}
                            setSomeFieldValues={setSomeFieldValues}
                            lapisUrl={lapisUrl}
                            lapisSearchParameters={lapisSearchParameters}
                        />
                    </div>
                ))}
            </div>
            <div className='mt-6 flex justify-end'>
                <Button type='button' className='btn loculusColor text-white -py-1' onClick={onClose}>
                    Close
                </Button>
            </div>
        </BaseDialog>
    );
};
