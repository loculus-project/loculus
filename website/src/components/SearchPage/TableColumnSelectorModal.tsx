import { type FC, useMemo } from 'react';

import { isActiveForSelectedReferenceName } from './isActiveForSelectedReferenceName.tsx';
import { ACCESSION_VERSION_FIELD } from '../../settings.ts';
import type { Metadata, Schema } from '../../types/config.ts';
import { type MetadataVisibility } from '../../utils/search.ts';
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
    selectedReferenceName: string | null;
};

export const TableColumnSelectorModal: FC<TableColumnSelectorModalProps> = ({
    isOpen,
    onClose,
    schema,
    columnVisibilities,
    setAColumnVisibility,
    selectedReferenceName,
}) => {
    const columnFieldItems: FieldItem[] = useMemo(
        () =>
            schema.metadata
                .filter((field) => !(field.hideInSearchResultsTable ?? false))
                .map((field) => ({
                    name: field.name,
                    displayName: field.displayName ?? field.name,
                    header: field.header,
                    displayState: getDisplayState(field, selectedReferenceName, schema.suborganismIdentifierField),
                    isChecked: columnVisibilities.get(field.name)?.isChecked ?? false,
                })),
        [schema.metadata, schema.suborganismIdentifierField, columnVisibilities, selectedReferenceName],
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
    selectedReferenceName: string | null,
    suborganismIdentifierField: string | undefined,
): FieldItemDisplayState | undefined {
    if (field.name === ACCESSION_VERSION_FIELD) {
        return { type: fieldItemDisplayStateType.alwaysChecked };
    }

    if (!isActiveForSelectedReferenceName(selectedReferenceName, field)) {
        return {
            type: fieldItemDisplayStateType.greyedOut,
            tooltip: `This is only visible when the ${suborganismIdentifierField ?? 'suborganismIdentifierField'} ${field.onlyForReferenceName} is selected.`,
        };
    }

    return undefined;
}
