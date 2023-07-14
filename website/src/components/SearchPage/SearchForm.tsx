import { Autocomplete, CircularProgress, createFilterOptions, TextField } from '@mui/material';
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

    const dateFields = useMemo(
        () =>
            fieldValues
                .filter((field) => field.type === 'date')
                .map((field) => (
                    <DateField
                        key={field.name}
                        field={field}
                        handleFieldChange={handleFieldChange}
                        isLoading={isLoading}
                    />
                )),
        [fieldValues, isLoading],
    );

    const autoCompleteFields = useMemo(
        () =>
            fieldValues
                .filter((field) => field.options !== undefined)
                .map((field) => (
                    <AutoCompleteField
                        key={field.name}
                        field={field}
                        handleFieldChange={handleFieldChange}
                        isLoading={isLoading}
                    />
                )),
        [fieldValues, isLoading],
    );

    const otherFields = useMemo(
        () =>
            fieldValues
                .filter((field) => field.options === undefined && field.type !== 'date')
                .map((field) => (
                    <NormalTextField
                        key={field.name}
                        field={field}
                        handleFieldChange={handleFieldChange}
                        isLoading={isLoading}
                    />
                )),
        [fieldValues, isLoading],
    );

    return (
        <LocalizationProvider dateAdapter={AdapterLuxon}>
            <form onSubmit={handleSearch}>
                <div className='flex flex-col'>
                    {dateFields}
                    {autoCompleteFields}
                    {otherFields}
                    <SearchButton isLoading={isLoading} />
                </div>
            </form>
        </LocalizationProvider>
    );
};

function buildQueryUrl(fieldValues: Filter[]) {
    const searchFilters = fieldValues
        .filter((field) => field.filter !== '')
        .map((field) => `${field.name}=${field.filter}`);
    const redirectUrl = searchFilters.length === 0 ? '' : `&${searchFilters.join('&')}`;
    return `search?search=true${redirectUrl}`;
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
