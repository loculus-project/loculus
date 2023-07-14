import {
    Autocomplete,
    Box,
    Checkbox,
    CircularProgress,
    createFilterOptions,
    FormControlLabel,
    TextField,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { sentenceCase } from 'change-case';
import { DateTime } from 'luxon';
import React, { type FC, type FormEventHandler, useMemo, useState } from 'react';

import { fetchAutoCompletion } from '../../config';
import { useOffCanvas } from '../../hooks/useOffCanvas';
import type { Config, Filter } from '../../types';
import { OffCanvasOverlay } from '../OffCanvasOverlay';
import { SandwichIcon } from '../SandwichIcon';

const queryClient = new QueryClient();

interface SearchFormProps {
    metadataSettings: Filter[];
    config: Config;
}

export const SearchForm: FC<SearchFormProps> = ({ metadataSettings, config }) => {
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
        location.href = buildQueryUrl([]);
    };

    const fields = useMemo(
        () =>
            fieldValues.map((field) => {
                const props = { key: field.name, field, handleFieldChange, isLoading, config, allFields: fieldValues };
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
        [config, fieldValues, isLoading],
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

type FieldProps = {
    field: Filter;
    allFields: Filter[];
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
    config: Config;
};

const DateField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
    <DatePicker
        format='yyyy-MM-dd'
        label={field.label}
        disabled={isLoading}
        slotProps={{
            textField: {
                size: 'small',
                margin: 'dense',
            },
        }}
        value={field.filter === '' ? null : DateTime.fromISO(field.filter)}
        onChange={(date: DateTime | null) => {
            const dateString = date?.toISODate() ?? '';
            return handleFieldChange(field.name, dateString);
        }}
    />
);

const AutoCompleteField: FC<FieldProps> = ({ field, allFields, handleFieldChange, isLoading, config }) => {
    const [open, setOpen] = useState(false);

    const { data: options, isLoading: isOptionListLoading } = useQuery({
        queryKey: [field.name, open, allFields],
        queryFn: async () => {
            if (!open) {
                return [];
            }
            const filterParams = new URLSearchParams();
            allFields
                .filter((f) => f.name !== field.name && f.filter !== '')
                .forEach((f) => filterParams.set(f.name, f.filter));
            return fetchAutoCompletion(field.name, filterParams, config);
        },
    });

    return (
        <Autocomplete
            filterOptions={createFilterOptions({
                matchFrom: 'any',
                limit: 200,
            })}
            open={open}
            onOpen={() => {
                setOpen(true);
            }}
            onClose={() => {
                setOpen(false);
            }}
            options={options ?? []}
            loading={isOptionListLoading}
            getOptionLabel={(option) => option.option ?? ''}
            disabled={isLoading}
            size='small'
            renderInput={(params) => (
                <TextField {...params} label={field.label} margin='dense' size='small' className='w-60' />
            )}
            renderOption={(props, option) => (
                <Box component='li' {...props}>
                    {option.option} ({option.count.toLocaleString()})
                </Box>
            )}
            isOptionEqualToValue={(option, value) => option.option === value.option}
            onChange={(_, value) => {
                return handleFieldChange(field.name, value?.option ?? '');
            }}
            value={{ option: field.filter, count: NaN }}
            autoComplete
        />
    );
};

const PangoLineageField: FC<FieldProps> = ({ field, allFields, handleFieldChange, isLoading, config }) => {
    const filter = field.filter;
    const [includeSubLineages, setIncludeSubLineages] = useState(filter.length > 0 ? filter.endsWith('*') : true);

    const textField = {
        ...field,
        filter: includeSubLineages ? filter.slice(0, filter.length - 1) : filter,
    };
    const handleTextFieldChange = (metadataName: string, newFilter: string) => {
        if (newFilter.length > 0) {
            handleFieldChange(metadataName, newFilter + (includeSubLineages ? '*' : ''));
        } else {
            handleFieldChange(metadataName, '');
        }
    };
    const handleIncludeSubLineagesChange = (checked: boolean) => {
        setIncludeSubLineages(checked);
        if (filter.length > 0) {
            handleFieldChange(field.name, textField.filter + (checked ? '*' : ''));
        }
    };

    const textFieldProps = {
        field: textField,
        allFields,
        handleFieldChange: handleTextFieldChange,
        isLoading,
        config,
    };

    return (
        <>
            {field.autocomplete === true ? (
                <AutoCompleteField {...textFieldProps} />
            ) : (
                <NormalTextField {...textFieldProps} />
            )}
            <div className='ml-2'>
                <FormControlLabel
                    control={<Checkbox checked={includeSubLineages} />}
                    label='Include sublineages'
                    disabled={isLoading}
                    onChange={(_, checked) => handleIncludeSubLineagesChange(checked)}
                />
            </div>
        </>
    );
};

const NormalTextField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
    <TextField
        variant='outlined'
        margin='dense'
        label={field.filter === '' ? undefined : field.label}
        placeholder={field.filter !== '' ? undefined : field.label}
        type={field.type}
        size='small'
        value={field.filter}
        disabled={isLoading}
        onChange={(e) => handleFieldChange(field.name, e.target.value)}
        InputLabelProps={{
            shrink: true,
        }}
    />
);

const SearchButton: FC<{ isLoading: boolean }> = ({ isLoading }) => (
    <button className='btn normal-case w-full' type='submit' disabled={isLoading}>
        {isLoading ? <CircularProgress size={20} color='primary' /> : 'Search'}
    </button>
);
