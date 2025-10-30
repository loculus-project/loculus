import { type FC, useMemo } from 'react';

import { isActiveForSelectedSuborganism } from './isActiveForSelectedSuborganism.tsx';
import { ACCESSION_VERSION_FIELD } from '../../settings.ts';
import type { Metadata, Schema } from '../../types/config.ts';
import { type MetadataVisibility } from '../../utils/search.ts';
import { type FieldItem, type FieldItemDisplayState, FieldSelectorModal } from '../common/FieldSelectorModal.tsx';

export type TableColumnSelectorModalProps = {
    isOpen: boolean;
    onClose: () => void;
    schema: Schema;
    columnVisibilities: Map<string, MetadataVisibility>;
    setAColumnVisibility: (fieldName: string, selected: boolean) => void;
    selectedSuborganism: string | null;
};

export const TableColumnSelectorModal: FC<TableColumnSelectorModalProps> = ({
    isOpen,
    onClose,
    schema,
    columnVisibilities,
    setAColumnVisibility,
    selectedSuborganism,
}) => {
    const columnFieldItems: FieldItem[] = useMemo(
        () =>
            schema.metadata
                .filter((field) => !(field.hideInSearchResultsTable ?? false))
                .map((field) => ({
                    name: field.name,
                    displayName: field.displayName ?? field.name,
                    header: field.header,
                    displayState: getDisplayState(field, selectedSuborganism, schema),
                    isChecked: columnVisibilities.get(field.name)?.isChecked ?? false,
                })),
        [schema.metadata, schema.primaryKey, columnVisibilities],
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

function getDisplayState(
    field: Metadata,
    selectedSuborganism: string | null,
    schema: Schema,
): FieldItemDisplayState | undefined {
    if (field.name === ACCESSION_VERSION_FIELD) {
        return { type: 'alwaysChecked' };
    }

    if (!isActiveForSelectedSuborganism(selectedSuborganism, field)) {
        return {
            type: 'greyedOut',
            tooltip: `This is only visible when the ${schema.suborganismIdentifierField} ${field.onlyForSuborganism} is selected.`,
        };
    }

    return undefined;
}
