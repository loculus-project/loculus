import { type Dispatch, type FC, type SetStateAction } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../../settings.ts';
import { type Metadata, type Schema } from '../../../../types/config.ts';
import type { MetadataVisibility } from '../../../../utils/search.ts';
import {
    type FieldItem,
    type FieldItemDisplayState,
    fieldItemDisplayStateType,
    FieldSelectorModal as CommonFieldSelectorModal,
} from '../../../common/FieldSelectorModal.tsx';
import { isActiveForSelectedReferenceName } from '../../isActiveForSelectedReferenceName.tsx';
import type { SegmentReferenceSelections } from '../../../../utils/sequenceTypeHelpers.ts';

type FieldSelectorProps = {
    isOpen: boolean;
    onClose: () => void;
    schema: Schema;
    downloadFieldVisibilities: Map<string, MetadataVisibility>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    selectedReferenceNames: SegmentReferenceSelections;
};

export const FieldSelectorModal: FC<FieldSelectorProps> = ({
    isOpen,
    onClose,
    schema,
    downloadFieldVisibilities,
    onSelectedFieldsChange,
    selectedReferenceNames,
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

    const fieldItems: FieldItem[] = schema.metadata.map((field) => ({
        name: field.name,
        displayName: field.displayName,
        header: field.header,
        displayState: getDisplayState(field, selectedReferenceNames, schema),
        isChecked: downloadFieldVisibilities.get(field.name)?.isChecked ?? false,
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

function getDisplayState(
    field: Metadata,
    selectedReferenceNames: SegmentReferenceSelections,
    schema: Schema,
): FieldItemDisplayState | undefined {
    if (field.name === ACCESSION_VERSION_FIELD) {
        return { type: fieldItemDisplayStateType.alwaysChecked };
    }

    if (!isActiveForSelectedReferenceName(selectedReferenceNames, field)) {
        return {
            type: fieldItemDisplayStateType.disabled,
            tooltip: `This is only available when the ${schema.referenceIdentifierField} ${field.onlyForReference} is selected.`,
        };
    }

    return undefined;
}

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
