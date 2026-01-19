import { type FC, useMemo } from 'react';

import { isActiveForSelectedReferenceName } from './isActiveForSelectedReferenceName.tsx';
import { ACCESSION_VERSION_FIELD } from '../../settings.ts';
import type { Metadata, Schema } from '../../types/config.ts';
import { type MetadataVisibility } from '../../utils/search.ts';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';
import {
    type FieldItem,
    type FieldItemDisplayState,
    fieldItemDisplayStateType,
    FieldSelectorModal,
} from '../common/FieldSelectorModal.tsx';

export type TableColumnSelectorModalProps = {
    isOpen: boolean;
    onClose: () => void;
    schema: Schema;
    columnVisibilities: Map<string, MetadataVisibility>;
    setAColumnVisibility: (fieldName: string, selected: boolean) => void;
    selectedReferenceNames: SegmentReferenceSelections;
};

export const TableColumnSelectorModal: FC<TableColumnSelectorModalProps> = ({
    isOpen,
    onClose,
    schema,
    columnVisibilities,
    setAColumnVisibility,
    selectedReferenceNames,
}) => {
    const columnFieldItems: FieldItem[] = useMemo(
        () =>
            schema.metadata
                .filter((field) => !(field.hideInSearchResultsTable ?? false))
                .map((field) => ({
                    name: field.name,
                    displayName: field.displayName ?? field.name,
                    header: field.header,
                    displayState: getDisplayState(field, selectedReferenceNames, schema.referenceIdentifierField),
                    isChecked: columnVisibilities.get(field.name)?.isChecked ?? false,
                })),
        [schema.metadata, schema.referenceIdentifierField, columnVisibilities, selectedReferenceNames],
    );

    return (
        <FieldSelectorModal
            title='Customize columns'
            isOpen={isOpen}
            onClose={onClose}
            fields={columnFieldItems}
            setFieldSelected={setAColumnVisibility}
        />
    );
};

export function getDisplayState(
    field: Metadata,
    selectedReferenceNames: SegmentReferenceSelections,
    referenceIdentifierField: string | undefined,
): FieldItemDisplayState | undefined {
    if (field.name === ACCESSION_VERSION_FIELD) {
        return { type: fieldItemDisplayStateType.alwaysChecked };
    }

    if (!isActiveForSelectedReferenceName(selectedReferenceNames, field)) {
        return {
            type: fieldItemDisplayStateType.greyedOut,
            tooltip: `This is only visible when the ${referenceIdentifierField ?? 'referenceIdentifierField'} ${field.onlyForReference} is selected.`,
        };
    }

    return undefined;
}
