import {
    Autocomplete,
    Checkbox,
    CircularProgress,
    createFilterOptions,
    FormControlLabel,
    TextField,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { sentenceCase } from 'change-case';
import { DateTime } from 'luxon';
import React, { type FC, type FormEventHandler, useMemo, useState } from 'react';

import type { Filter } from '../../types';

interface SearchFormProps {
    metadataSettings: Filter[];
}

export const SearchForm: FC<SearchFormProps> = ({ metadataSettings }) => {
    const [fieldValues, setFieldValues] = useState(
        metadataSettings.map((metadata) => ({
            ...metadata,
            label: metadata.label ?? sentenceCase(metadata.name),
        })),
    );
    const [isLoading, setIsLoading] = useState(false);

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
                const props = { key: field.name, field, handleFieldChange, isLoading };
                if (field.type === 'date') {
                    return <DateField {...props} />;
                }
                if (field.type === 'pango_lineage') {
                    return <PangoLineageField {...props} />;
                }
                if (field.options !== undefined) {
                    return <AutoCompleteField {...props} />;
                }
                return <NormalTextField {...props} />;
            }),
        [fieldValues, isLoading],
    );

    return (
        <LocalizationProvider dateAdapter={AdapterLuxon}>
            <div className='text-right'>
                <button className='underline' onClick={resetSearch}>
                    Reset
                </button>
            </div>
            <form onSubmit={handleSearch}>
                <div className='flex flex-col'>
                    {fields}
                    <SearchButton isLoading={isLoading} />
                </div>
            </form>
        </LocalizationProvider>
    );
};

function buildQueryUrl(fieldValues: Filter[]) {
    const params = new URLSearchParams();
    fieldValues.filter((field) => field.filter !== '').forEach((field) => params.set(field.name, field.filter));
    return `search?${params.toString()}`;
}

type FieldProps = {
    field: Filter;
    handleFieldChange: (metadataName: string, filter: string) => void;
    isLoading: boolean;
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

const AutoCompleteField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
    <Autocomplete
        filterOptions={createFilterOptions({
            matchFrom: 'any',
            limit: 200,
        })}
        options={field.options ?? []}
        getOptionLabel={(option) => option.option ?? ''}
        disabled={isLoading}
        size='small'
        renderInput={(params) => (
            <TextField {...params} label={field.label} margin='dense' size='small' className='w-60' />
        )}
        isOptionEqualToValue={(option, value) => option.option === value.option}
        onChange={(_, value) => {
            return handleFieldChange(field.name, value?.option ?? '');
        }}
        value={field.options?.find((option) => option.option === field.filter) ?? null}
        autoComplete
    />
);

const PangoLineageField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => {
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
        handleFieldChange: handleTextFieldChange,
        isLoading,
    };

    return (
        <>
            {field.options !== undefined ? (
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
    <button className='btn normal-case my-2' type='submit' disabled={isLoading}>
        {isLoading ? <CircularProgress size={20} color='primary' /> : 'Search'}
    </button>
);
