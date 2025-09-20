import { type FC } from 'react';

import { NormalTextField } from './NormalTextField.tsx';
import type { MetadataFilter } from '../../../types/config.ts';

type AccessionFieldProps = {
    field: MetadataFilter;
    textValue: string;
    setTextValue: (value: string) => void;
};

export const AccessionField: FC<AccessionFieldProps> = ({ field, textValue, setTextValue }) => {
    return (
        <NormalTextField
            field={field}
            setSomeFieldValues={([, filter]) => {
                setTextValue(filter as string);
            }}
            fieldValue={textValue}
            multiline={field.multiEntry === true}
        />
    );
};
