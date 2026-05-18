import { useId } from 'react';

import { TextField } from './TextField';
import type { MultiFieldSearch, SetSomeFieldValues } from '../../../types/config.ts';
import { CustomTooltip } from '../../../utils/CustomTooltip';
import type { MetadataFilterSchema } from '../../../utils/search.ts';
import DisabledUntilHydrated from '../../DisabledUntilHydrated';
import { Button } from '../../common/Button.tsx';
import MaterialSymbolsHelpOutline from '~icons/material-symbols/help-outline';

export interface MultiFieldSearchFieldProps {
    multiFieldSearch: MultiFieldSearch;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue: string;
    filterSchema: MetadataFilterSchema;
}

export const MultiFieldSearchField = ({
    multiFieldSearch,
    setSomeFieldValues,
    fieldValue,
    filterSchema,
}: MultiFieldSearchFieldProps) => {
    const tooltipId = useId();

    return (
        <div className='relative'>
            <DisabledUntilHydrated>
                <TextField
                    label={multiFieldSearch.displayName}
                    type='string'
                    fieldValue={fieldValue}
                    onChange={(e) => setSomeFieldValues([multiFieldSearch.name, e.target.value])}
                    autoComplete='off'
                />
            </DisabledUntilHydrated>
            <div className='absolute top-1/2 -translate-y-1/3 right-1.5'>
                <Button data-tooltip-id={tooltipId} className='text-gray-400 hover:text-primary-600 inline-flex'>
                    <MaterialSymbolsHelpOutline className='inline-block h-6 w-5' />
                </Button>
            </div>
            <CustomTooltip id={tooltipId} place='top'>
                <p className='mb-1'>Search across the following fields:</p>
                <ul className='list-disc list-inside'>
                    {multiFieldSearch.fields.map((field) => (
                        <li key={field} className='text-xs'>
                            {filterSchema.getLabel(field)}
                        </li>
                    ))}
                </ul>
            </CustomTooltip>
        </div>
    );
};
