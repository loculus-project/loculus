import { type FC } from 'react';

import { NormalTextField } from './NormalTextField.tsx';

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
               
            }}
            setAFieldValue={(_, filter) => {
                setTextValue(filter);
                
            }}
            fieldValue={textValue}
            isLoading={false}
            multiline
        />
    );
};
