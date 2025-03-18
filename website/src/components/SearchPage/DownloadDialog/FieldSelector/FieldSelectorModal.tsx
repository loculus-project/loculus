import { useState, type FC } from 'react';

import { ACCESSION_VERSION_FIELD } from '../../../../settings.ts';
import { type Metadata } from '../../../../types/config.ts';
import { BaseDialog } from '../../../common/BaseDialog.tsx';

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

    const handleToggleField = (fieldName: string) => {
        if (fieldName === ACCESSION_VERSION_FIELD) {
            return;
        }

        const newSelectedFields = new Set(selectedFields);
        if (newSelectedFields.has(fieldName)) {
            newSelectedFields.delete(fieldName);
        } else {
            newSelectedFields.add(fieldName);
        }
        newSelectedFields.add(ACCESSION_VERSION_FIELD);

        setSelectedFields(newSelectedFields);
        onSave(Array.from(newSelectedFields));
    };

    const handleSelectAll = () => {
        const newSelectedFields = new Set<string>();
        metadata.forEach((field) => {
            newSelectedFields.add(field.name);
        });
        setSelectedFields(newSelectedFields);
        onSave(Array.from(newSelectedFields));
    };

    const handleSelectNone = () => {
        const newSelectedFields = new Set<string>();
        newSelectedFields.add(ACCESSION_VERSION_FIELD);
        setSelectedFields(newSelectedFields);
        onSave(Array.from(newSelectedFields));
    };

    // Group fields by header
    const fieldsByHeader = metadata.reduce<Record<string, Metadata[]>>((acc, field) => {
        const header = field.header ?? 'Other';
        acc[header] = acc[header] ?? [];
        acc[header].push(field);
        return acc;
    }, {});

    // Sort headers alphabetically, but keep "Other" at the end
    const sortedHeaders = Object.keys(fieldsByHeader).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
    });

    return (
        <BaseDialog title='Select Fields to Download' isOpen={isOpen} onClose={onClose} fullWidth={false}>
            <div className='min-w-[950px]'></div>
            <div className='mt-2 flex justify-between px-2'>
                <div>
                    <button
                        type='button'
                        className='text-sm text-primary-600 hover:text-primary-900 font-medium mr-4'
                        onClick={handleSelectAll}
                    >
                        Select All
                    </button>
                    <button
                        type='button'
                        className='text-sm text-primary-600 hover:text-primary-900 font-medium'
                        onClick={handleSelectNone}
                    >
                        Select None
                    </button>
                </div>
            </div>
            <div className='mt-2 max-h-[60vh] overflow-y-auto p-2'>
                {sortedHeaders.map((header) => (
                    <div key={header} className='mb-6'>
                        <h3 className='font-medium text-lg mb-2 text-gray-700'>{header}</h3>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2'>
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
                                .map((field) => (
                                    <div key={field.name} className='flex items-center'>
                                        <input
                                            type='checkbox'
                                            id={`field-${field.name}`}
                                            className={`h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 ${
                                                field.name === ACCESSION_VERSION_FIELD
                                                    ? 'opacity-60 cursor-not-allowed'
                                                    : ''
                                            }`}
                                            checked={
                                                selectedFields.has(field.name) || field.name === ACCESSION_VERSION_FIELD
                                            }
                                            onChange={() => handleToggleField(field.name)}
                                            disabled={field.name === ACCESSION_VERSION_FIELD}
                                        />
                                        <label
                                            htmlFor={`field-${field.name}`}
                                            className={`ml-2 text-sm ${field.name === ACCESSION_VERSION_FIELD ? 'text-gray-500' : 'text-gray-700'}`}
                                        >
                                            {field.displayName ?? field.name}
                                        </label>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                <div className='mt-6 flex justify-end'>
                    <button type='button' className='btn loculusColor text-white -pt-1' onClick={onClose}>
                        Done
                    </button>
                </div>
            </div>
        </BaseDialog>
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
