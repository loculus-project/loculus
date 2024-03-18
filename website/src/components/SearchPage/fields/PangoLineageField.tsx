import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { type FC, useState } from 'react';

import { AutoCompleteField, type AutoCompleteFieldProps } from './AutoCompleteField';
import { NormalTextField } from './NormalTextField';

export const PangoLineageField: FC<AutoCompleteFieldProps> = ({
    field,
    allFields,
    handleFieldChange,
    isLoading,
    lapisUrl,
}) => {
    const filter = field.filterValue;
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
        lapisUrl,
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
