import { type FC, useMemo } from 'react';

import type { Schema } from '../../types/config.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { type MetadataVisibility } from '../../utils/search.ts';
import type { SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';
import { type FieldItem, FieldSelectorModal, getDisplayState } from '../common/FieldSelectorModal.tsx';

export type TableColumnSelectorModalProps = {
    isOpen: boolean;
    onClose: () => void;
    schema: Schema;
    columnVisibilities: Map<string, MetadataVisibility>;
    setAColumnVisibility: (fieldName: string, selected: boolean) => void;
    selectedReferenceNames: SegmentReferenceSelections;
    referenceGenomesInfo: ReferenceGenomesInfo;
};

export const TableColumnSelectorModal: FC<TableColumnSelectorModalProps> = ({
    isOpen,
    onClose,
    schema,
    columnVisibilities,
    setAColumnVisibility,
    selectedReferenceNames,
    referenceGenomesInfo,
}) => {
    const columnFieldItems: FieldItem[] = useMemo(
        () =>
            schema.metadata
                .filter((field) => !(field.hideInSearchResultsTable ?? false))
                .map((field) => ({
                    name: field.name,
                    displayName: field.displayName ?? field.name,
                    header: field.header,
                    displayState: getDisplayState(
                        field,
                        selectedReferenceNames,
                        schema.referenceIdentifierField,
                        referenceGenomesInfo,
                    ),
                    isChecked: columnVisibilities.get(field.name)?.isChecked ?? false,
                })),
        [
            schema.metadata,
            schema.referenceIdentifierField,
            columnVisibilities,
            selectedReferenceNames,
            referenceGenomesInfo,
        ],
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
