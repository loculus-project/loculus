import { CircularProgress, TextField } from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import React, { type FC, useState } from 'react';

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

    const handleFieldChange = (metadataName: string, filter: string): void => {
        setFieldValues((prev) => {
            const updatedFields = [...prev];
            const fieldToChange = updatedFields.find((entry) => entry.name === metadataName);
            if (fieldToChange === undefined) {
                throw new Error('Tried to change a filter that does not exist');
            }
            fieldToChange.filter = filter;
            return updatedFields;
        });
    };

    // use useMutation?
    const handleSearch = async (): Promise<void> => {
        // Perform search operation using the searchQuery and fieldValues
        const searchFilters = fieldValues
            .filter((field) => field.filter !== '')
            .map((field) => `${field.name}=${field.filter}`);
        const redirectUrl = searchFilters.length === 0 ? '' : `&${searchFilters.join('&')}`;

        const query = `search?search=true${redirectUrl}`;

        setIsLoading(true);
        location.href = query;
    };

    const fieldGroups = [];
    for (let i = 0; i < fieldValues.length; i += 4) {
        const group = Object.values(fieldValues).slice(i, i + 4);
        fieldGroups.push(group);
    }

    return (
        <LocalizationProvider dateAdapter={AdapterLuxon}>
            <div className='mb-5'>
                <TextField
                    fullWidth
                    variant='outlined'
                    margin='normal'
                    placeholder='Accessions'
                    value={accessions}
                    onChange={handleInputChange}
                />
                {fieldGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className='flex gap-4 justify-evenly'>
                        {group.map((field, index) =>
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
                                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                                    InputLabelProps={{
                                        shrink: true,
                                    }}
                                    className='w-1/4'
                                />
                            ) : (
                                <DatePicker
                                    key={index}
                                    label={field.name}
                                    slotProps={{
                                        textField: {
                                            size: 'small',
                                            variant: 'outlined',
                                            margin: 'dense',
                                            className: 'w-1/4',
                                        },
                                    }}
                                />
                            ),
                        )}
                    </div>
                ))}
                <div className='flex justify-end mt-4'>
                    <button className='btn' style={{ textTransform: 'none' }} onClick={handleSearch}>
                        Search
                    </button>
                </div>
                {isLoading && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            zIndex: 9999,
                        }}
                    >
                        <div
                            style={{
                                position: 'relative',
                                height: '100vh',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <CircularProgress size={100} color='primary' />
                        </div>
                    </div>
                )}
            </div>
        </LocalizationProvider>
    );
};
