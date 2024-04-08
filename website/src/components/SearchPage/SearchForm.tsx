import { Dialog, Transition } from '@headlessui/react';
import CircularProgress from '@mui/material/CircularProgress';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { type FC, type FormEventHandler, useMemo, useState, useCallback } from 'react';

import { AccessionField } from './fields/AccessionField.tsx';
import { AutoCompleteField, type AutoCompleteFieldProps } from './fields/AutoCompleteField';
import { DateField, TimestampField } from './fields/DateField.tsx';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { PangoLineageField } from './fields/PangoLineageField';
import { getClientLogger } from '../../clientLogger.ts';
import { getLapisUrl } from '../../config.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import { type ClassOfSearchPageType, navigateToSearchLikePage, routes } from '../../routes/routes.ts';
import type { AccessionFilter, GroupedMetadataFilter, MetadataFilter, MutationFilter } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';

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
    filters,
    initialAccessionFilter,
    initialMutationFilter,
    clientConfig,
    referenceGenomesSequenceNames,
    classOfSearchPage,
    groupId,
}) => {
    const fieldList: (MetadataFilter | GroupedMetadataFilter)[] = consolidateGroupedFields(filters);

    const [fieldValues, setFieldValues] = useState<((MetadataFilter | GroupedMetadataFilter) & { label: string })[]>(
        fieldList.map((filter) => ({
            ...filter,
            label: filter.label ?? filter.displayName ?? sentenceCase(filter.name),
            isVisible: true,
        })),
    );

    const alwaysPresentFieldNames = ['Accession', 'Mutation'];
    const [accessionFilter, setAccessionFilter] = useState<AccessionFilter>(initialAccessionFilter);
    const [mutationFilter, setMutationFilter] = useState<MutationFilter>(initialMutationFilter);
    const [isLoading, setIsLoading] = useState(false);
    const { isOpen: isMobileOpen, close: closeOnMobile, toggle: toggleMobileOpen } = useOffCanvas();
    const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);

    const handleFieldChange = useCallback(
        (metadataName: string, filter: string) => {
            setFieldValues((prev) => {
                const updatedFields = [...prev];
                const fieldToChange = deepFind(updatedFields, (field) => field.name === metadataName);
                if (fieldToChange === undefined) {
                    throw new Error(`Tried to change a filter that does not exist: ${metadataName}`);
                }
                fieldToChange.filterValue = filter;
                return updatedFields;
            });
        },
        [setFieldValues],
    );

    const flattenFields = (fields: (MetadataFilter | GroupedMetadataFilter)[]): MetadataFilter[] => {
        const flattenedFields: MetadataFilter[] = [];
        for (const field of fields) {
            if (field.grouped === true) {
                flattenedFields.push(...flattenFields(field.groupedFields));
            } else {
                flattenedFields.push(field);
            }
        }
        return flattenedFields;
    };

    const handleSearch: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        const flattenedFields = flattenFields(fieldValues);
        const searchableFieldValues = flattenedFields.filter((field) => !(field.notSearchable ?? false));
        navigateToSearchLikePage(
            organism,
            classOfSearchPage,
            groupId,
            searchableFieldValues,
            accessionFilter,
            mutationFilter,
        );
    };

    const resetSearch = async () => {
        setIsLoading(true);
        await clientLogger.info('reset_search');
        location.href = routes.searchPage(organism, []);
    };

    const lapisUrl = getLapisUrl(clientConfig, organism);

    const flattenedFieldValues = flattenFields(fieldValues);

    const fields = useMemo(
        () =>
            fieldValues.map((field) => {
                if (field.isVisible !== true) {
                    return null;
                }
                if (field.grouped === true) {
                    return (
                        <div key={field.name} className='flex flex-col border p-3 mb-3 rounded-md border-gray-300'>
                            <h3 className='text-gray-500 text-sm mb-1'>{field.label}</h3>

                            {field.groupedFields.map((groupedField) => (
                                <SearchField
                                    key={groupedField.name}
                                    field={groupedField}
                                    handleFieldChange={handleFieldChange}
                                    isLoading={isLoading}
                                    lapisUrl={lapisUrl}
                                    allFields={flattenedFieldValues}
                                />
                            ))}
                        </div>
                    );
                }

                return (
                    <SearchField
                        key={field.name}
                        field={field}
                        handleFieldChange={handleFieldChange}
                        isLoading={isLoading}
                        lapisUrl={lapisUrl}
                        allFields={flattenedFieldValues}
                    />
                );
            }),
        [fieldValues, handleFieldChange, isLoading, lapisUrl, flattenedFieldValues],
    );

    const toggleCustomizeModal = () => {
        setIsCustomizeModalOpen(!isCustomizeModalOpen);
    };

    const handleFieldVisibilityChange = (fieldName: string, isVisible: boolean) => {
        setFieldValues((prev) =>
            prev.map((field) => {
                if (field.name === fieldName) {
                    return { ...field, isVisible };
                }
                return field;
            }),
        );
    };

    return (
        <QueryClientProvider client={queryClient}>
            <div className='text-right -mb-10 md:hidden'>
                <button onClick={toggleMobileOpen} className='btn btn-xs'>
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
                    <div className='flex'>
                        <h2 className='text-lg font-semibold flex-1 md:hidden'>Search query</h2>
                        <button className='underline' onClick={resetSearch}>
                            Reset
                        </button>
                        <button className='ml-4 md:hidden' onClick={closeOnMobile}>
                            <SandwichIcon isOpen />
                        </button>
                    </div>
                    <div className='mt-4 mb-2'>
                        <button
                            className='text-sm underline text-blue-600 hover:text-blue-800 focus:outline-none'
                            onClick={toggleCustomizeModal}
                        >
                            Customize
                        </button>
                    </div>
                    <form onSubmit={handleSearch}>
                        <div className='flex flex-col'>
                            <AccessionField initialValue={initialAccessionFilter} onChange={setAccessionFilter} />
                            <MutationField
                                referenceGenomes={referenceGenomesSequenceNames}
                                value={mutationFilter}
                                onChange={setMutationFilter}
                            />
                            {fields}
                        </div>
                        <div className='sticky bottom-0 z-10'>
                            <div
                                className='h-3'
                                style={{ background: 'linear-gradient(to bottom, transparent, white)' }}
                            />
                            <div className='bg-white pb-2 pt-1.5'>
                                <SearchButton isLoading={isLoading} />
                            </div>
                        </div>
                    </form>
                </div>
            </div>

            <Transition appear show={isCustomizeModalOpen}>
                <Dialog as='div' className='fixed inset-0 z-10 overflow-y-auto' onClose={toggleCustomizeModal}>
                    <div className='min-h-screen px-4 text-center'>
                        <Dialog.Overlay className='fixed inset-0 bg-black opacity-30' />

                        <span className='inline-block h-screen align-middle' aria-hidden='true'>
                            &#8203;
                        </span>

                        <div className='inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl'>
                            <Dialog.Title as='h3' className='text-lg font-medium leading-6 text-gray-900'>
                                Customize Search Options
                            </Dialog.Title>

                            <div className='mt-4'>
                                {alwaysPresentFieldNames.map((fieldName) => {
                                    return (
                                        <div key={fieldName} className='flex items-center mb-2'>
                                            <input
                                                type='checkbox'
                                                checked
                                                disabled
                                                className='form-checkbox h-5 w-5 text-gray-300'
                                            />
                                            <span className='ml-2 text-gray-700'>{fieldName}</span>
                                        </div>
                                    );
                                })}

                                {fieldValues
                                    .filter((field) => field.notSearchable !== true)
                                    .map((field) => (
                                        <div key={field.name} className='flex items-center mb-2'>
                                            <input
                                                type='checkbox'
                                                checked={field.isVisible !== false}
                                                onChange={(e) =>
                                                    handleFieldVisibilityChange(field.name, e.target.checked)
                                                }
                                                className='form-checkbox h-5 w-5 text-blue-600'
                                            />
                                            <span className='ml-2 text-gray-700'>{field.label}</span>
                                        </div>
                                    ))}
                            </div>

                            <div className='mt-6'>
                                <button
                                    type='button'
                                    className='inline-flex justify-center px-4 py-2 text-sm font-medium text-blue-900 bg-blue-100 border border-transparent rounded-md hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500'
                                    onClick={toggleCustomizeModal}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </Dialog>
            </Transition>
        </QueryClientProvider>
    );
};

const SearchField: FC<AutoCompleteFieldProps> = (props) => {
    const { field } = props;
    field.label = field.label ?? field.displayName ?? sentenceCase(field.name);

    if (field.notSearchable === true) {
        return null;
    }

    switch (field.type) {
        case 'date':
            return <DateField {...props} />;
        case 'timestamp':
            return <TimestampField {...props} />;
        case 'pango_lineage':
            return <PangoLineageField {...props} />;
        default:
            if (field.autocomplete === true) {
                return <AutoCompleteField {...props} />;
            }
            return <NormalTextField {...props} />;
    }
};

const SearchButton: FC<{ isLoading: boolean }> = ({ isLoading }) => (
    <button
        className='normal-case 
     py-2 rounded-md font-semibold px-4 text-sm
     border-primary-600 border
     text-primary-600 bg-white
     w-full
     hover:bg-primary-600 hover:text-white

    
    '
        type='submit'
        disabled={isLoading}
    >
        {isLoading ? <CircularProgress size={20} color='inherit' /> : 'Search sequences'}
    </button>
);

const deepFind = (
    listed: (MetadataFilter | GroupedMetadataFilter)[],
    matchFunction: (field: MetadataFilter | GroupedMetadataFilter) => boolean,
): MetadataFilter | undefined => {
    // does a normal find, but for grouped fields iterates over the grouped fields and returns fields within
    for (const field of listed) {
        if (field.grouped === true) {
            const found = deepFind(field.groupedFields, matchFunction);
            if (found !== undefined) {
                return found;
            }
        } else if (matchFunction(field)) {
            return field;
        }
    }

    return undefined;
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
