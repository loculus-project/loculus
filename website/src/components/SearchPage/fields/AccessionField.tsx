import { type FC, useState, useRef } from 'react';

import { NormalTextField } from './NormalTextField.tsx';
import type { AccessionFilter } from '../../../types/config.ts';

type AccessionFieldProps = {
    initialValue: AccessionFilter;
    onChange: (accessionFilter: AccessionFilter) => void;
};

export const AccessionField: FC<AccessionFieldProps> = ({ initialValue, onChange }) => {
    const [textValue, setTextValue] = useState((initialValue.accession ?? []).sort().join('\n'));
    const [isFocused, setIsFocused] = useState(false);
    const fieldRef = useRef<HTMLInputElement>(null);

    return (
        <NormalTextField
            field={{
                type: 'string',
                label: 'Accession(s)',
                autocomplete: false,
                name: 'accession',
                notSearchable: false,
                filterValue: textValue,
            }}
            handleFieldChange={(_, filter) => {
                setTextValue(filter);
                const accessions = filter
                    .split(/[\t,;\n ]/)
                    .map((s) => s.trim())
                    .filter((s) => s !== '')
                    .map((s) => {
                        if (s.includes('.')) {
                            return s.split('.')[0];
                        }
                        return s;
                    });
                const uniqueAccessions = [...new Set(accessions)];
                onChange({ accession: uniqueAccessions });
            }}
            isLoading={false}
            multiline={textValue.split('\n').length > 1 || isFocused}
            onFocus={() => {
                setIsFocused(true);
                if (fieldRef.current) {
                    setTimeout(() => fieldRef.current?.focus(), 10); // When we change to multiline we lose focus - so we need to add it back
                }
            }}
            onBlur={() => setIsFocused(false)}
            inputRef={fieldRef}
        />
    );
};
