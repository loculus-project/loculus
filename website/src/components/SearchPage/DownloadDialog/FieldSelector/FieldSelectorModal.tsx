import { useState, type FC } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../../settings.ts';
import { type Metadata } from '../../../../types/config.ts';
import { FieldSelectorModal as CommonFieldSelectorModal, type FieldItem } from '../../../common/FieldSelectorModal.tsx';

type FieldSelectorProps = {
    isOpen: boolean;
    onClose: () => void;
    metadata: Metadata[];
    initialSelectedFields?: string[];
    onSave: (selectedFields: string[]) => void;
};

export const FieldSelectorModal: FC<FieldSelectorProps> = ({
    isOpen,
    onClose,
    metadata,
    initialSelectedFields,
    onSave,
}) => {
    const getInitialSelectedFields = () => {
        const fields = new Set(initialSelectedFields ?? getDefaultSelectedFields(metadata));
        fields.add(ACCESSION_VERSION_FIELD);
        return fields;
    };

    const [selectedFields, setSelectedFields] = useState<Set<string>>(getInitialSelectedFields());

    const handleFieldSelection = (fieldName: string, selected: boolean) => {
        setSelectedFields((prevSelectedFields) => {
            const newSelectedFields = new Set(prevSelectedFields);

            if (selected) {
                newSelectedFields.add(fieldName);
            } else {
                newSelectedFields.delete(fieldName);
            }

            onSave(Array.from(newSelectedFields));
            return newSelectedFields;
        });
    };

    const fieldItems: FieldItem[] = metadata.map((field) => ({
        name: field.name,
        displayName: field.displayName,
        header: field.header,
        alwaysSelected: field.name === ACCESSION_VERSION_FIELD,
        disabled: field.name === ACCESSION_VERSION_FIELD,
    }));

    return (
        <CommonFieldSelectorModal
            title='Select fields to download'
            isOpen={isOpen}
            onClose={onClose}
            fields={fieldItems}
            selectedFields={selectedFields}
            setFieldSelected={handleFieldSelection}
        />
    );
};

/**
 * Gets the default list of field names that should be selected
 * based on the includeInDownloadsByDefault flag
 */
export function getDefaultSelectedFields(metadata: Metadata[]): string[] {
    const defaultFields = metadata.filter((field) => field.includeInDownloadsByDefault).map((field) => field.name);

    // Ensure ACCESSION_VERSION_FIELD is always included
    if (!defaultFields.includes(ACCESSION_VERSION_FIELD)) {
        defaultFields.push(ACCESSION_VERSION_FIELD);
    }

    return defaultFields;
}
