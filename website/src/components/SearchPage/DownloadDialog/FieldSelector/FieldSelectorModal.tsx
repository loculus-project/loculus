import { type Dispatch, type FC, type SetStateAction } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../../settings.ts';
import { type Metadata } from '../../../../types/config.ts';
import {
    type FieldItem,
    type FieldItemDisplayState,
    FieldSelectorModal as CommonFieldSelectorModal,
} from '../../../common/FieldSelectorModal.tsx';

type FieldSelectorProps = {
    isOpen: boolean;
    onClose: () => void;
    metadata: Metadata[];
    selectedFields: Set<string>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    selectedSuborganism: string | null;
};

export const FieldSelectorModal: FC<FieldSelectorProps> = ({
    isOpen,
    onClose,
    metadata,
    selectedFields,
    onSelectedFieldsChange,
    selectedSuborganism,
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
        displayState: getDisplayState(field, selectedSuborganism),
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

function getDisplayState(field: Metadata, selectedSuborganism: string | null): FieldItemDisplayState | undefined {
    if (field.name === ACCESSION_VERSION_FIELD) {
        return { type: 'alwaysChecked' };
    }

    if (!isActiveForSelectedSuborganism(selectedSuborganism, field)) {
        return { type: 'disabled' };
    }

    return undefined;
}

/**
 * Gets the default list of field names that should be selected
 * based on the includeInDownloadsByDefault flag
 */
export function getDefaultSelectedFields(metadata: Metadata[], selectedSuborganism: string | null): Set<string> {
    const defaultFields = new Set(
        metadata
            .filter((field) => field.includeInDownloadsByDefault)
            .filter((field) => isActiveForSelectedSuborganism(selectedSuborganism, field))
            .map((field) => field.name),
    );
    defaultFields.add(ACCESSION_VERSION_FIELD);
    return defaultFields;
}

function isActiveForSelectedSuborganism(selectedSuborganism: string | null, field: Metadata) {
    return (
        selectedSuborganism === null ||
        field.onlyShowInSearchWhenSuborganismIs === undefined ||
        field.onlyShowInSearchWhenSuborganismIs === selectedSuborganism
    );
}
