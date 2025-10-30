import { type FC } from 'react';
import { Button } from "src/components/common/Button";

import { BaseDialog } from './BaseDialog.tsx';

export type FieldItem = {
    name: string;
    displayName?: string;
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
    const handleToggleField = (fieldName: string) => {
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
                    <Button
                        type='button'
                        className='text-sm text-primary-600 hover:text-primary-900 font-medium mr-4'
                        onClick={handleSelectAll}
                    >
                        Select all
                    </Button>
                    <Button
                        type='button'
                        className='text-sm text-primary-600 hover:text-primary-900 font-medium'
                        onClick={handleSelectNone}
                    >
                        Select none
                    </Button>
                </div>
            </div>
            <div className='mt-2 max-h-[60vh] overflow-y-auto p-2'>
                {sortedHeaders.map((header) => (
                    <div key={header} className='mb-6'>
                        <h3 className='font-medium text-lg mb-2 text-gray-700'>{header}</h3>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2'>
                            {fieldsByHeader[header]
                                .sort((a, b) => {
                                    type WithOptionalOrder = { order?: number };
                                    const aOrder = 'order' in a ? (a as WithOptionalOrder).order : undefined;
                                    const bOrder = 'order' in b ? (b as WithOptionalOrder).order : undefined;

                                    if (aOrder !== undefined && bOrder !== undefined) {
                                        return aOrder - bOrder;
                                    } else if (aOrder !== undefined) {
                                        return -1;
                                    } else if (bOrder !== undefined) {
                                        return 1;
                                    }

                                    const aDisplay = a.displayName ?? a.name;
                                    const bDisplay = b.displayName ?? b.name;
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
                                            checked={selectedFields.has(field.name) || Boolean(field.alwaysSelected)}
                                            onChange={() => handleToggleField(field.name)}
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
                                            {field.displayName ?? field.name}
                                            {field.alwaysSelected ? ' (always included)' : ''}
                                        </label>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}

                <div className='mt-6 flex justify-end'>
                    <Button
                        type='button'
                        className='btn loculusColor text-white -py-1'
                        onClick={onClose}
                        data-testid='field-selector-close-button'
                    >
                        Close
                    </Button>
                </div>
            </div>
        </BaseDialog>
    );
};
