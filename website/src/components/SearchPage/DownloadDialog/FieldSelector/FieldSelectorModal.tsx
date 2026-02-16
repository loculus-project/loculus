import { type Dispatch, type FC, type SetStateAction } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../../settings.ts';
import { type Metadata, type Schema } from '../../../../types/config.ts';
import type { ReferenceGenomesInfo } from '../../../../types/referencesGenomes.ts';
import type { MetadataVisibility } from '../../../../utils/search.ts';
import type { SegmentReferenceSelections } from '../../../../utils/sequenceTypeHelpers.ts';
import {
    type FieldItem,
    FieldSelectorModal as CommonFieldSelectorModal,
    getDisplayState,
} from '../../../common/FieldSelectorModal.tsx';

type FieldSelectorProps = {
    isOpen: boolean;
    onClose: () => void;
    schema: Schema;
    downloadFieldVisibilities: Map<string, MetadataVisibility>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    selectedReferenceNames?: SegmentReferenceSelections;
    referenceGenomesInfo: ReferenceGenomesInfo;
};

export const FieldSelectorModal: FC<FieldSelectorProps> = ({
    isOpen,
    onClose,
    schema,
    downloadFieldVisibilities,
    onSelectedFieldsChange,
    selectedReferenceNames,
    referenceGenomesInfo,
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
        displayState: getDisplayState(
            field,
            referenceGenomesInfo,
            selectedReferenceNames,
            schema.referenceIdentifierField,
            false,
        ),
        isChecked: downloadFieldVisibilities.get(field.name)?.isChecked ?? false,
        orderOnDetailsPage: field.orderOnDetailsPage,
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
