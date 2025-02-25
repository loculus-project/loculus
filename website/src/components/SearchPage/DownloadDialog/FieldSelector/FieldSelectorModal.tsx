import { useState, type FC } from 'react';

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
    const [selectedFields, setSelectedFields] = useState<Set<string>>(
        new Set(initialSelectedFields ?? getDefaultSelectedFields(metadata)),
    );

    const handleToggleField = (fieldName: string) => {
        const newSelectedFields = new Set(selectedFields);
        if (newSelectedFields.has(fieldName)) {
            newSelectedFields.delete(fieldName);
        } else {
            newSelectedFields.add(fieldName);
        }
        setSelectedFields(newSelectedFields);
        // Apply changes immediately
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
        <BaseDialog title='Select Fields to Download' isOpen={isOpen} onClose={onClose}>
            <div className='mt-4 max-h-[60vh] overflow-y-auto p-2'>
                {sortedHeaders.map((header) => (
                    <div key={header} className='mb-6'>
                        <h3 className='font-medium text-lg mb-2 text-gray-700'>{header}</h3>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2'>
                            {fieldsByHeader[header]
                                .filter((field) => !field.hideOnSequenceDetailsPage)
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((field) => (
                                    <div key={field.name} className='flex items-center'>
                                        <input
                                            type='checkbox'
                                            id={`field-${field.name}`}
                                            className='h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600'
                                            checked={selectedFields.has(field.name)}
                                            onChange={() => handleToggleField(field.name)}
                                        />
                                        <label htmlFor={`field-${field.name}`} className='ml-2 text-sm text-gray-700'>
                                            {field.displayName ?? field.name}
                                        </label>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                <div className='mt-6 flex justify-end'>
                    <button
                        type='button'
                        className='inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                        onClick={onClose}
                    >
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
    return metadata
        .filter((field) => field.includeInDownloadsByDefault && !field.hideOnSequenceDetailsPage)
        .map((field) => field.name);
}
