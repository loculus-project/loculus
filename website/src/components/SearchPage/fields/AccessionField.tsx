import { type FC, useState } from 'react';

import { NormalTextField } from './NormalTextField.tsx';
import type { AccessionFilter } from '../../../types/config.ts';

type AccessionFieldProps = {
    textValue: string;
    setTextValue: (value: string) => void;
};

export const AccessionField: FC<AccessionFieldProps> = ({ textValue, setTextValue }) => {
   

    return (
        <NormalTextField
            field={{
                type: 'string',
                label: 'Accession',
                autocomplete: false,
                name: 'accession',
                notSearchable: false,
                filterValue: textValue,
            }}
            setAFieldValue={(_, filter) => {
                setTextValue(filter);
                
            }}
            isLoading={false}
            multiline
        />
    );
};
