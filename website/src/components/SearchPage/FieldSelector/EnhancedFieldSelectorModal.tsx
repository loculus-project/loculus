import { useState, type FC, useMemo } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import { type Metadata } from '../../../types/config.ts';
import { BaseDialog } from '../../common/BaseDialog.tsx';

export type EnhancedFieldSelectorProps = {
    // Dialog state
    isOpen: boolean;
    onClose: () => void;
    title: string;
    
    // Core field data
    fields: {
        name: string;
        displayName?: string;
        header?: string;
        order?: number;
        alwaysIncluded?: boolean;
    }[];
    
    // Selection state - support both mechanisms
    selectedFields?: string[];                    // For selected field set
    visibilityMap?: Map<string, boolean>;         // For compatibility with existing code
    
    // Selection callbacks - support both mechanisms
    onSave?: (selectedFields: string[]) => void;  // Bulk update
    onToggleVisibility?: (field: string, isVisible: boolean) => void; // Individual toggle
    
    // UI customization
    description?: string;
    showSelectAllNone?: boolean;
    showCategories?: boolean;
    gridColumns?: number;
    alwaysPresentFieldNames?: string[];
};

export const EnhancedFieldSelectorModal: FC<EnhancedFieldSelectorProps> = ({
    isOpen,
    onClose,
    title,
    fields,
    selectedFields: initialSelectedFields,
    visibilityMap,
    onSave,
    onToggleVisibility,
    description,
    showSelectAllNone = true,
    showCategories = true,
    gridColumns = 2,
    alwaysPresentFieldNames = [],
}) => {
    // Determine the initial selected fields based on the provided props
    const getInitialSelectedFields = (): Set<string> => {
        if (initialSelectedFields) {
            // If selectedFields is provided, use that
            const fieldSet = new Set(initialSelectedFields);
            // Always add accession version field if it's defined as a constant
            if (typeof ACCESSION_VERSION_FIELD !== 'undefined') {
                fieldSet.add(ACCESSION_VERSION_FIELD);
            }
            return fieldSet;
        } else if (visibilityMap) {
            // If visibilityMap is provided, extract visible fields
            const fieldSet = new Set<string>();
            visibilityMap.forEach((isVisible, fieldName) => {
                if (isVisible) {
                    fieldSet.add(fieldName);
                }
            });
            return fieldSet;
        }
        // Default to empty set if neither is provided
        return new Set<string>();
    };

    const [selectedFields, setSelectedFields] = useState<Set<string>>(getInitialSelectedFields());

    const handleToggleField = (fieldName: string) => {
        // Skip toggling always included fields
        if (alwaysPresentFieldNames.includes(fieldName) || 
            (typeof ACCESSION_VERSION_FIELD !== 'undefined' && fieldName === ACCESSION_VERSION_FIELD)) {
            return;
        }

        // Create a new set to avoid mutating the existing one
        const newSelectedFields = new Set(selectedFields);
        
        if (newSelectedFields.has(fieldName)) {
            newSelectedFields.delete(fieldName);
        } else {
            newSelectedFields.add(fieldName);
        }

        // Always include ACCESSION_VERSION_FIELD if it's defined
        if (typeof ACCESSION_VERSION_FIELD !== 'undefined') {
            newSelectedFields.add(ACCESSION_VERSION_FIELD);
        }

        // Update internal state
        setSelectedFields(newSelectedFields);
        
        // Call the appropriate callback based on what was provided
        if (onToggleVisibility) {
            onToggleVisibility(fieldName, !selectedFields.has(fieldName));
        } else if (onSave) {
            onSave(Array.from(newSelectedFields));
        }
    };

    const handleSelectAll = () => {
        const newSelectedFields = new Set<string>();
        fields.forEach((field) => {
            newSelectedFields.add(field.name);
        });
        
        setSelectedFields(newSelectedFields);
        
        if (onSave) {
            onSave(Array.from(newSelectedFields));
        } else if (onToggleVisibility) {
            // Update each field individually using the map-based API
            fields.forEach((field) => {
                if (!selectedFields.has(field.name)) {
                    onToggleVisibility(field.name, true);
                }
            });
        }
    };

    const handleSelectNone = () => {
        const newSelectedFields = new Set<string>();
        
        // Always include ACCESSION_VERSION_FIELD if it's defined
        if (typeof ACCESSION_VERSION_FIELD !== 'undefined') {
            newSelectedFields.add(ACCESSION_VERSION_FIELD);
        }
        
        // Always include always present fields
        alwaysPresentFieldNames.forEach(fieldName => {
            newSelectedFields.add(fieldName);
        });
        
        setSelectedFields(newSelectedFields);
        
        if (onSave) {
            onSave(Array.from(newSelectedFields));
        } else if (onToggleVisibility) {
            // Update each field individually using the map-based API
            fields.forEach((field) => {
                if (selectedFields.has(field.name) && 
                    !alwaysPresentFieldNames.includes(field.name) && 
                    !(typeof ACCESSION_VERSION_FIELD !== 'undefined' && field.name === ACCESSION_VERSION_FIELD)) {
                    onToggleVisibility(field.name, false);
                }
            });
        }
    };

    // Group fields by header if showCategories is true
    const fieldsByHeader = useMemo(() => {
        if (!showCategories) {
            return { 'Fields': fields };
        }
        
        return fields.reduce<Record<string, typeof fields>>((acc, field) => {
            const header = field.header ?? 'Other';
            acc[header] = acc[header] ?? [];
            acc[header].push(field);
            return acc;
        }, {});
    }, [fields, showCategories]);

    // Sort headers alphabetically, but keep "Other" at the end
    const sortedHeaders = useMemo(() => {
        return Object.keys(fieldsByHeader).sort((a, b) => {
            if (a === 'Other') return 1;
            if (b === 'Other') return -1;
            return a.localeCompare(b);
        });
    }, [fieldsByHeader]);

    return (
        <BaseDialog title={title} isOpen={isOpen} onClose={onClose} fullWidth={false}>
            <div className="min-w-[1000px]"></div>
            {description && <div className="mt-2 text-gray-700 text-sm px-2">{description}</div>}
            
            {showSelectAllNone && (
                <div className="mt-2 flex justify-between px-2">
                    <div>
                        <button
                            type="button"
                            className="text-sm text-primary-600 hover:text-primary-900 font-medium mr-4"
                            onClick={handleSelectAll}
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            className="text-sm text-primary-600 hover:text-primary-900 font-medium"
                            onClick={handleSelectNone}
                        >
                            Select None
                        </button>
                    </div>
                    <div>
                        <span className="text-sm text-gray-600">
                            {selectedFields.size} field{selectedFields.size !== 1 ? 's' : ''} selected
                        </span>
                    </div>
                </div>
            )}
            
            <div className="mt-2 max-h-[60vh] overflow-y-auto p-2">
                {sortedHeaders.map((header) => (
                    <div key={header} className="mb-6">
                        {showCategories && <h3 className="font-medium text-lg mb-2 text-gray-700">{header}</h3>}
                        <div className={`grid grid-cols-1 ${gridColumns > 1 ? `md:grid-cols-${gridColumns}` : ''} gap-x-4 gap-y-2`}>
                            {fieldsByHeader[header]
                                .sort((a, b) => {
                                    // Sort by order property if available, otherwise alphabetically by name
                                    if (a.order !== undefined && b.order !== undefined) {
                                        return a.order - b.order;
                                    } else if (a.order !== undefined) {
                                        return -1; // a has order, b doesn't, so a comes first
                                    } else if (b.order !== undefined) {
                                        return 1; // b has order, a doesn't, so b comes first
                                    }
                                    return a.name.localeCompare(b.name);
                                })
                                .map((field) => {
                                    const isAlwaysIncluded = 
                                        alwaysPresentFieldNames.includes(field.name) || 
                                        field.alwaysIncluded || 
                                        (typeof ACCESSION_VERSION_FIELD !== 'undefined' && field.name === ACCESSION_VERSION_FIELD);
                                    
                                    return (
                                        <div key={field.name} className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id={`field-${field.name}`}
                                                className={`h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 ${
                                                    isAlwaysIncluded ? 'opacity-60 cursor-not-allowed' : ''
                                                }`}
                                                checked={selectedFields.has(field.name) || isAlwaysIncluded}
                                                onChange={() => handleToggleField(field.name)}
                                                disabled={isAlwaysIncluded}
                                            />
                                            <label
                                                htmlFor={`field-${field.name}`}
                                                className={`ml-2 text-sm ${
                                                    isAlwaysIncluded ? 'text-gray-500' : 'text-gray-700'
                                                }`}
                                            >
                                                {field.displayName ?? field.name}
                                            </label>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                ))}

                <div className="mt-6 flex justify-end">
                    <button type="button" className="btn loculusColor text-white -py-1" onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </BaseDialog>
    );
};

/**
 * Helper function to convert a Metadata array to the simplified field format
 * used by EnhancedFieldSelectorModal
 */
export function metadataToFields(metadata: Metadata[]): EnhancedFieldSelectorProps['fields'] {
    return metadata.map(m => ({
        name: m.name,
        displayName: m.displayName,
        header: m.header,
        order: m.order,
        alwaysIncluded: m.name === ACCESSION_VERSION_FIELD
    }));
}

/**
 * Helper function to convert a name-to-label map to the simplified field format
 * used by EnhancedFieldSelectorModal
 */
export function nameToLabelMapToFields(
    nameToLabelMap: Record<string, string>, 
    visibilities?: Map<string, boolean>,
    originalMetadata?: Metadata[]
): EnhancedFieldSelectorProps['fields'] {
    // Create a map of field names to original metadata for quick lookup
    const metadataByName = originalMetadata?.reduce((map, item) => {
        map.set(item.name, item);
        return map;
    }, new Map<string, Metadata>());

    return Object.entries(nameToLabelMap).map(([name, displayName]) => {
        // Try to get header information from original metadata if available
        const metadata = metadataByName?.get(name);
        
        return {
            name,
            displayName,
            header: metadata?.header,
            order: metadata?.order
        };
    });
}