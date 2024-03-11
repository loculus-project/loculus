import { CircularProgress } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { type FC, type FormEventHandler, useMemo, useState } from 'react';

import { AccessionField } from './fields/AccessionField.tsx';
import { AutoCompleteField, type AutoCompleteFieldProps } from './fields/AutoCompleteField';
import { DateField, TimestampField } from './fields/DateField';
import { MutationField } from './fields/MutationField.tsx';
import { NormalTextField } from './fields/NormalTextField';
import { PangoLineageField } from './fields/PangoLineageField';
import { getClientLogger } from '../../clientLogger.ts';
import { getLapisUrl } from '../../config.ts';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import { routes, navigateToSearchLikePage, type ClassOfSearchPageType } from '../../routes.ts';
import type { AccessionFilter, MetadataFilter, MutationFilter } from '../../types/config.ts';
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
    group?: string;
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
    group,
}) => {
    const [fieldValues, setFieldValues] = useState<(MetadataFilter & { label: string })[]>(
        filters.map((filter) => ({
            ...filter,
            label: filter.label ?? sentenceCase(filter.name),
        })),
    );
    const [accessionFilter, setAccessionFilter] = useState<AccessionFilter>(initialAccessionFilter);
    const [mutationFilter, setMutationFilter] = useState<MutationFilter>(initialMutationFilter);
    const [isLoading, setIsLoading] = useState(false);
    const { isOpen: isMobileOpen, close: closeOnMobile, toggle: toggleMobileOpen } = useOffCanvas();

    const handleFieldChange = (metadataName: string, filter: string) => {
        setFieldValues((prev) => {
            const updatedFields = [...prev];
            const fieldToChange = updatedFields.find((entry) => entry.name === metadataName);
            if (fieldToChange === undefined) {
                throw new Error(`Tried to change a filter that does not exist: ${metadataName}`);
            }
            fieldToChange.filterValue = filter;
            return updatedFields;
        });
    };

    const handleSearch: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        const searchableFieldValues = fieldValues.filter((field) => !(field.notSearchable ?? false));
        navigateToSearchLikePage(
            organism,
            classOfSearchPage,
            group,
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

    const fields = useMemo(
        () =>
            fieldValues.map((field) => (
                <SearchField
                    key={field.name}
                    field={field}
                    handleFieldChange={handleFieldChange}
                    isLoading={isLoading}
                    lapisUrl={lapisUrl}
                    allFields={fieldValues}
                />
            )),
        [lapisUrl, fieldValues, isLoading],
    );

    return (
        <QueryClientProvider client={queryClient}>
            <LocalizationProvider dateAdapter={AdapterLuxon}>
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
                      md:translate-y-0 md:static md:h-auto md:overflow-visible`}
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
            </LocalizationProvider>
        </QueryClientProvider>
    );
};

const SearchField: FC<AutoCompleteFieldProps> = (props) => {
    const { field } = props;

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
    <button className='btn normal-case w-full' type='submit' disabled={isLoading}>
        {isLoading ? <CircularProgress size={20} color='primary' /> : 'Search'}
    </button>
);
