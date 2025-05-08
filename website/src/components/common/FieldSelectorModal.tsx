import { type FC } from 'react';

import { BaseDialog } from './BaseDialog.tsx';

export type FieldItem = {
    name: string;
    displayName?: string;
    label?: string;
    header?: string;
    disabled?: boolean;
    alwaysSelected?: boolean;
    selected?: boolean;
};

type FieldSelectorModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    fields: FieldItem[];
    selectedFields: Set<string>;
    setFieldSelected: (fieldName: string, selected: boolean) => void;
};

export const FieldSelectorModal: FC<FieldSelectorModalProps> = ({
    isOpen,
    onClose,
    title,
    fields,
    selectedFields,
    setFieldSelected,
}) => {
    const handleToggleField = (fieldName: string, alwaysSelected = false) => {
        if (alwaysSelected) {
            return;
        }

        const isCurrentlySelected = selectedFields.has(fieldName);
        setFieldSelected(fieldName, !isCurrentlySelected);

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    };

    const handleSelectAll = () => {
        fields.forEach((field) => {
            if (!field.alwaysSelected && !field.disabled) {
                setFieldSelected(field.name, true);
            }
        });

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    };

    const handleSelectNone = () => {
        // Update each field individually to ensure URL parameters are set
        fields.forEach((field) => {
            if (!field.alwaysSelected && !field.disabled) {
                setFieldSelected(field.name, false);
            }
        });

        // Trigger window resize event to refresh scrollbars
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    };

    // Group fields by header
    const fieldsByHeader = fields.reduce<Record<string, FieldItem[]>>((acc, field) => {
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
        <BaseDialog title={title} isOpen={isOpen} onClose={onClose} fullWidth={false}>
            <div className='min-w-[1000px]'></div>
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
                                    // We're adding a type to safely access a potential 'order' property
                                    type WithOptionalOrder = { order?: number };
                                    const aOrder = 'order' in a ? (a as WithOptionalOrder).order : undefined;
                                    const bOrder = 'order' in b ? (b as WithOptionalOrder).order : undefined;

                                    if (aOrder !== undefined && bOrder !== undefined) {
                                        return aOrder - bOrder;
                                    } else if (aOrder !== undefined) {
                                        return -1; // a has order, b doesn't, so a comes first
                                    } else if (bOrder !== undefined) {
                                        return 1; // b has order, a doesn't, so b comes first
                                    }
                                    // Sort by displayName if available, otherwise by name
                                    const aDisplay = a.displayName ?? a.label ?? a.name;
                                    const bDisplay = b.displayName ?? b.label ?? b.name;
                                    return aDisplay.localeCompare(bDisplay);
                                })
                                .map((field) => (
                                    <div key={field.name} className='flex items-center'>
                                        <input
                                            type='checkbox'
                                            id={`field-${field.name}`}
                                            className={`h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 ${
                                                field.disabled || field.alwaysSelected
                                                    ? 'opacity-60 cursor-not-allowed'
                                                    : ''
                                            }`}
                                            checked={selectedFields.has(field.name) || field.alwaysSelected}
                                            onChange={() => handleToggleField(field.name, field.alwaysSelected)}
                                            disabled={Boolean(field.disabled) || Boolean(field.alwaysSelected)}
                                        />
                                        <label
                                            htmlFor={`field-${field.name}`}
                                            className={`ml-2 text-sm ${
                                                field.disabled || field.alwaysSelected
                                                    ? 'text-gray-500'
                                                    : 'text-gray-700'
                                            }`}
                                        >
                                            {field.displayName ?? field.label ?? field.name}
                                            {field.alwaysSelected ? ' (always included)' : ''}
                                        </label>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                <div className='mt-6 flex justify-end'>
                    <button 
                        type='button' 
                        className='btn loculusColor text-white -py-1' 
                        onClick={onClose}
                        data-testid='field-selector-close-button'
                    >
                        Close
                    </button>
                </div>
            </div>
        </BaseDialog>
    );
};
