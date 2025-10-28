import { type Dispatch, type FC, type SetStateAction } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../../settings.ts';
import { type Metadata } from '../../../../types/config.ts';
import { type FieldItem, FieldSelectorModal as CommonFieldSelectorModal } from '../../../common/FieldSelectorModal.tsx';

type FieldSelectorProps = {
    isOpen: boolean;
    onClose: () => void;
    metadata: Metadata[];
    selectedFields: Set<string>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
};

export const FieldSelectorModal: FC<FieldSelectorProps> = ({
    isOpen,
    onClose,
    metadata,
    selectedFields,
    onSelectedFieldsChange,
}) => {
    const handleFieldSelection = (fieldName: string, selected: boolean) => {
        onSelectedFieldsChange((prevSelectedFields) => {
            const newSelectedFields = new Set(prevSelectedFields);

            if (selected) {
                newSelectedFields.add(fieldName);
            } else {
                newSelectedFields.delete(fieldName);
            }

            return newSelectedFields;
        });
    };

    const fieldItems: FieldItem[] = metadata.map((field) => ({
        name: field.name,
        displayName: field.displayName,
        header: field.header,
        alwaysSelected: field.name === ACCESSION_VERSION_FIELD,
        disabled: field.name === ACCESSION_VERSION_FIELD,
        isChecked: selectedFields.has(field.name),
    }));

    return (
        <CommonFieldSelectorModal
            title='Select fields to download'
            isOpen={isOpen}
            onClose={onClose}
            fields={fieldItems}
            setFieldSelected={handleFieldSelection}
        />
    );
};

/**
 * Gets the default list of field names that should be selected
 * based on the includeInDownloadsByDefault flag
 */
export function getDefaultSelectedFields(metadata: Metadata[]): Set<string> {
    const defaultFields = new Set(
        metadata.filter((field) => field.includeInDownloadsByDefault).map((field) => field.name),
    );
    defaultFields.add(ACCESSION_VERSION_FIELD);
    return defaultFields;
}
