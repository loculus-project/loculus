import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import { type FC, useEffect, useMemo, useState } from 'react';

import type { FieldProps } from './FieldProps';
import { getClientLogger } from '../../../clientLogger.ts';
import { lapisClientHooks } from '../../../services/serviceHooks.ts';
import type { MetadataFilter } from '../../../types/config.ts';

const logger = getClientLogger('AutoCompleteField');

export type AutoCompleteFieldProps = FieldProps & {
    allFields: MetadataFilter[];
    lapisUrl: string;
};

export const AutoCompleteField: FC<AutoCompleteFieldProps> = ({
    field,
    allFields,
    handleFieldChange,
    isLoading,
    lapisUrl,
}) => {
    const [open, setOpen] = useState(false);

    const {
        data,
        isLoading: isOptionListLoading,
        error,
        mutate,
    } = lapisClientHooks(lapisUrl).zodiosHooks.useAggregated({}, {});

    useEffect(() => {
        if (error) {
            void logger.error('Error while loading autocomplete options: ' + error.message + ' - ' + error.stack);
        }
    }, [error]);

    const handleOpen = () => {
        const otherFieldsFilter = getOtherFieldsFilter(allFields, field);
        mutate({ fields: [field.name], ...otherFieldsFilter });
        setOpen(true);
    };

    const options = useMemo(
        () =>
            (data?.data || [])
                .filter((it) => typeof it[field.name] === 'string' || typeof it[field.name] === 'number')
                .map((it) => ({ option: it[field.name]?.toString() as string, count: it.count }))
                .sort((a, b) => (a.option.toLowerCase() < b.option.toLowerCase() ? -1 : 1)),
        [data, field.name],
    );

    return (
        <Autocomplete
            filterOptions={createFilterOptions({
                matchFrom: 'any',
                limit: 200,
            })}
            open={open}
            onOpen={handleOpen}
            onClose={() => setOpen(false)}
            options={options}
            loading={isOptionListLoading}
            getOptionLabel={(option) => option.option}
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
                return handleFieldChange(field.name, value?.option.toString() ?? '');
            }}
            onInputChange={(_, value) => {
                return handleFieldChange(field.name, value);
            }}
            value={{ option: field.filterValue, count: NaN }}
            autoComplete
        />
    );
};

function getOtherFieldsFilter(allFields: MetadataFilter[], field: MetadataFilter) {
    return allFields
        .filter((f) => f.name !== field.name && f.filterValue !== '')
        .reduce((acc, f) => ({ ...acc, [f.name]: f.filterValue }), {});
}
