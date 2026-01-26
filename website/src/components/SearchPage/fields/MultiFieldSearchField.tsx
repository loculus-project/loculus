import { TextField } from './TextField';
import type { MultiFieldSearch, SetSomeFieldValues } from '../../../types/config.ts';
import DisabledUntilHydrated from '../../DisabledUntilHydrated';

export interface MultiFieldSearchFieldProps {
    multiFieldSearch: MultiFieldSearch;
    setSomeFieldValues: SetSomeFieldValues;
    fieldValue: string;
}

export const MultiFieldSearchField = ({
    multiFieldSearch,
    setSomeFieldValues,
    fieldValue,
}: MultiFieldSearchFieldProps) => {
    return (
        <DisabledUntilHydrated>
            <TextField
                label={multiFieldSearch.displayName}
                type='string'
                fieldValue={fieldValue}
                onChange={(e) => setSomeFieldValues([multiFieldSearch.name, e.target.value])}
                autoComplete='off'
            />
        </DisabledUntilHydrated>
    );
};
