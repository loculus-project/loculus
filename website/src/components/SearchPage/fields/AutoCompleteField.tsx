import { Autocomplete, Box, createFilterOptions, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { type FC, useState } from 'react';

import type { FieldProps } from './FieldProps';
import { fetchAutoCompletion } from '../../../config';

export const AutoCompleteField: FC<FieldProps> = ({ field, allFields, handleFieldChange, isLoading, clientConfig }) => {
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
            return fetchAutoCompletion(field.name, filterParams, clientConfig);
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
            onInputChange={(_, value) => {
                return handleFieldChange(field.name, value);
            }}
            value={{ option: field.filter, count: NaN }}
            autoComplete
        />
    );
};
