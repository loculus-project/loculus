import { CircularProgress, TextField } from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import React, { type FC, type FormEventHandler, useState } from 'react';

import type { Filter } from '../../config';

interface SearchFormProps {
    metadataSettings: Filter[];
}

export const SearchForm: FC<SearchFormProps> = ({ metadataSettings }) => {
    const [accessions, setAccessions] = useState('');
    const [fieldValues, setFieldValues] = useState(metadataSettings);
    const [isLoading, setIsLoading] = useState(false);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        setAccessions(e.target.value);
    };

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

    return (
        <LocalizationProvider dateAdapter={AdapterLuxon}>
            <form className='mb-5' onSubmit={handleSearch}>
                <TextField
                    fullWidth
                    variant='outlined'
                    margin='normal'
                    placeholder='Accessions'
                    value={accessions}
                    disabled={isLoading}
                    onChange={handleInputChange}
                />
                <div className='flex gap-4 justify-stretch flex-wrap'>
                    {fieldValues.map((field, index) =>
                        field.type !== 'date' ? (
                            <TextField
                                key={index}
                                variant='outlined'
                                margin='dense'
                                label={field.filter === '' ? undefined : field.name}
                                placeholder={field.filter !== '' ? undefined : field.name}
                                type={field.type}
                                size='small'
                                value={field.filter}
                                disabled={isLoading}
                                onChange={(e) => handleFieldChange(field.name, e.target.value)}
                                InputLabelProps={{
                                    shrink: true,
                                }}
                                className='w-60'
                            />
                        ) : (
                            <DatePicker
                                key={index}
                                label={field.name}
                                disabled={isLoading}
                                slotProps={{
                                    textField: {
                                        size: 'small',
                                        variant: 'outlined',
                                        margin: 'dense',
                                        className: 'w-60',
                                    },
                                }}
                            />
                        ),
                    )}
                </div>
                <div className='flex justify-end mt-4'>
                    <button className='btn w-32' style={{ textTransform: 'none' }} type='submit' disabled={isLoading}>
                        {isLoading ? <CircularProgress size={20} color='primary' /> : 'Search'}
                    </button>
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
