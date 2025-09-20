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
                displayName: 'Accession',
                autocomplete: false,
                name: 'accession',
                notSearchable: false,
                multiEntry: true,
            }}
            setSomeFieldValues={([, filter]) => {
                setTextValue(filter as string);
            }}
            fieldValue={textValue}
            multiline
        />
    );
};
