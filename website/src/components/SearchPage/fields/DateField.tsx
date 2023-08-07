import { DatePicker } from '@mui/x-date-pickers';
import { DateTime } from 'luxon';
import type { FC } from 'react';

import type { FieldProps } from './FieldProps';

export const DateField: FC<FieldProps> = ({ field, handleFieldChange, isLoading }) => (
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
