import { CircularProgress } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { type FC, type FormEventHandler, useMemo, useState } from 'react';

import { AutoCompleteField } from './fields/AutoCompleteField';
import { DateField } from './fields/DateField';
import { NormalTextField } from './fields/NormalTextField';
import { PangoLineageField } from './fields/PangoLineageField';
import { clientLogger } from '../../api';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import type { ClientConfig, Filter } from '../../types';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';

const queryClient = new QueryClient();

interface SearchFormProps {
    metadataSettings: Filter[];
    clientConfig: ClientConfig;
}

export const SearchForm: FC<SearchFormProps> = ({ metadataSettings, clientConfig }) => {
    const [fieldValues, setFieldValues] = useState<(Filter & { label: string })[]>(
        metadataSettings.map((metadata) => ({
            ...metadata,
            label: metadata.label ?? sentenceCase(metadata.name),
        })),
    );
    const [isLoading, setIsLoading] = useState(false);
    const { isOpen: isMobileOpen, close: closeOnMobile, toggle: toggleMobileOpen } = useOffCanvas();

    const handleFieldChange = (metadataName: string, filter: string) => {
        setFieldValues((prev) => {
            const updatedFields = [...prev];
            const fieldToChange = updatedFields.find((entry) => entry.name === metadataName);
            if (fieldToChange === undefined) {
                throw new Error(`Tried to change a filter that does not exist: ${metadataName}`);
            }
            fieldToChange.filter = filter;
            return updatedFields;
        });
    };

    const handleSearch: FormEventHandler<HTMLFormElement> = async (event) => {
        event.preventDefault();
        setIsLoading(true);
        location.href = buildQueryUrl(fieldValues);
    };

    const resetSearch = async () => {
        setIsLoading(true);
        await clientLogger.info('reset_search');
        location.href = buildQueryUrl([]);
    };

    const fields = useMemo(
        () =>
            fieldValues.map((field) => {
                const props = {
                    key: field.name,
                    field,
                    handleFieldChange,
                    isLoading,
                    clientConfig,
                    allFields: fieldValues,
                };
                if (field.type === 'date') {
                    return <DateField {...props} />;
                }
                if (field.type === 'pango_lineage') {
                    return <PangoLineageField {...props} />;
                }
                if (field.autocomplete === true) {
                    return <AutoCompleteField {...props} />;
                }
                return <NormalTextField {...props} />;
            }),
        [clientConfig, fieldValues, isLoading],
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
                            <div className='flex flex-col'>{fields}</div>
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

function buildQueryUrl(fieldValues: Filter[]) {
    const params = new URLSearchParams();
    fieldValues.filter((field) => field.filter !== '').forEach((field) => params.set(field.name, field.filter));
    return `search${params.size !== 0 ? `?${params.toString()}` : ''}`;
}

const SearchButton: FC<{ isLoading: boolean }> = ({ isLoading }) => (
    <button className='btn normal-case w-full' type='submit' disabled={isLoading}>
        {isLoading ? <CircularProgress size={20} color='primary' /> : 'Search'}
    </button>
);
