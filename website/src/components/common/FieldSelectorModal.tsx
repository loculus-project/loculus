import { type FC, useId } from 'react';

import { BaseDialog } from './BaseDialog.tsx';
import { Button } from './Button';
import { ACCESSION_VERSION_FIELD } from '../../settings.ts';
import type { Metadata } from '../../types/config.ts';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { CustomTooltip } from '../../utils/CustomTooltip.tsx';
import { segmentReferenceSelected, type SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';

export type FieldItem = {
    name: string;
    displayName?: string;
    header?: string;
    displayState?: FieldItemDisplayState;
    order?: number;
    isChecked: boolean;
};

export const fieldItemDisplayStateType = {
    /** "disable" the checkbox and force-check it */
    alwaysChecked: 'alwaysChecked',
    /** grey out the label but allow checking/unchecking the checkbox */
    greyedOut: 'greyedOut',
    /** disable the checkbox (force-uncheck it) */
    disabled: 'disabled',
} as const;

export type FieldItemDisplayState =
    | {
          type: typeof fieldItemDisplayStateType.alwaysChecked;
      }
    | {
          type: typeof fieldItemDisplayStateType.greyedOut | typeof fieldItemDisplayStateType.disabled;
          /** On hover of the label: explain why the field is greyed out/disabled */
          tooltip: string;
      };

type FieldSelectorModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    fields: FieldItem[];
    setFieldSelected: (fieldName: string, selected: boolean) => void;
};

export const FieldSelectorModal: FC<FieldSelectorModalProps> = ({
    isOpen,
    onClose,
    title,
    fields,
    setFieldSelected,
}) => {
    const handleToggleField = (fieldName: string, newIsSelected: boolean) => {
        setFieldSelected(fieldName, newIsSelected);

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    };

    const handleSelectAll = () => {
        fields.forEach((field) => {
            if (!shouldDisableCheckbox(field.displayState)) {
                setFieldSelected(field.name, true);
            }
        });

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    };

    const handleSelectNone = () => {
        fields.forEach((field) => {
            if (!shouldDisableCheckbox(field.displayState)) {
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

    const headerGroups: { header: string; rows: FieldItem[]; meanOrder: number }[] = [];
    for (const [header, rows] of Object.entries(fieldsByHeader)) {
        rows.sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY));

        const definedOrders = rows.map((r) => r.order).filter((o): o is number => o !== undefined);
        const meanOrder =
            definedOrders.length > 0
                ? definedOrders.reduce((sum, o) => sum + o, 0) / definedOrders.length
                : Number.POSITIVE_INFINITY;
        headerGroups.push({ header, rows, meanOrder });
    }

    headerGroups.sort((a, b) => a.meanOrder - b.meanOrder);

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
                {headerGroups.map((headerGroup) => (
                    <div key={headerGroup.header} className='mb-6'>
                        <h3 className='font-medium text-lg mb-2 text-gray-700'>{headerGroup.header}</h3>
                        <div className='grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2'>
                            {headerGroup.rows.map((field) => (
                                <FieldSelectorModalField
                                    key={field.name}
                                    field={field}
                                    handleToggleField={handleToggleField}
                                />
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

type FieldSelectorModalFieldProps = {
    field: FieldItem;
    handleToggleField: (fieldName: string, newIsSelected: boolean) => void;
};

const FieldSelectorModalField: FC<FieldSelectorModalFieldProps> = ({ field, handleToggleField }) => {
    const tooltipId = useId();

    const disableCheckbox = shouldDisableCheckbox(field.displayState);
    const greyOutLabel = shouldGreyOutLabel(field.displayState);
    const alwaysChecked = isAlwaysChecked(field.displayState);
    const tooltip = getTooltip(field.displayState);

    return (
        <div className='flex items-center'>
            <input
                type='checkbox'
                id={`field-${field.name}`}
                className={`h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-600 ${
                    disableCheckbox ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                checked={isCheckboxChecked(field)}
                onChange={() => handleToggleField(field.name, !field.isChecked)}
                disabled={disableCheckbox}
            />
            <label
                htmlFor={`field-${field.name}`}
                className={`ml-2 text-sm ${greyOutLabel ? 'text-gray-400' : 'text-gray-700'}`}
                data-tooltip-id={tooltipId}
            >
                {field.displayName ?? field.name}
                {alwaysChecked ? ' (always included)' : ''}
                {tooltip !== undefined && <CustomTooltip id={tooltipId} content={tooltip} />}
            </label>
        </div>
    );
};

function isCheckboxChecked(field: FieldItem) {
    if (field.displayState?.type === fieldItemDisplayStateType.disabled) {
        return false;
    }

    if (field.displayState?.type === fieldItemDisplayStateType.alwaysChecked) {
        return true;
    }

    return field.isChecked;
}

function shouldDisableCheckbox(displayState: FieldItemDisplayState | undefined) {
    return (
        displayState?.type === fieldItemDisplayStateType.alwaysChecked ||
        displayState?.type === fieldItemDisplayStateType.disabled
    );
}

function shouldGreyOutLabel(displayState: FieldItemDisplayState | undefined) {
    return displayState?.type === fieldItemDisplayStateType.greyedOut || shouldDisableCheckbox(displayState);
}

function isAlwaysChecked(displayState: FieldItemDisplayState | undefined) {
    return displayState?.type === fieldItemDisplayStateType.alwaysChecked;
}

function getTooltip(displayState: FieldItemDisplayState | undefined) {
    return displayState?.type === fieldItemDisplayStateType.greyedOut ||
        displayState?.type === fieldItemDisplayStateType.disabled
        ? displayState.tooltip
        : undefined;
}

export function isActiveForSelectedReferenceName(selectedReferenceNames: SegmentReferenceSelections, field: Metadata) {
    const matchesReference =
        field.onlyForReference === undefined ||
        Object.values(selectedReferenceNames).some((value) => value === field.onlyForReference);

    return matchesReference;
}

export function getDisplayState(
    field: Metadata,
    referenceGenomesInfo: ReferenceGenomesInfo,
    selectedReferenceNames?: SegmentReferenceSelections,
    referenceIdentifierField?: string,
    greyOutIfStillRequiresReferenceSelection = true,
): FieldItemDisplayState | undefined {
    if (field.name === ACCESSION_VERSION_FIELD) {
        return { type: fieldItemDisplayStateType.alwaysChecked };
    }
    if (selectedReferenceNames === undefined) {
        return undefined;
    }

    if (
        field.onlyForReference !== undefined &&
        !segmentReferenceSelected(field.relatesToSegment!, referenceGenomesInfo, selectedReferenceNames)
    ) {
        if (greyOutIfStillRequiresReferenceSelection) {
            return {
                type: fieldItemDisplayStateType.greyedOut,
                tooltip: `This is only visible when the ${referenceIdentifierField ?? 'referenceIdentifierField'} ${field.onlyForReference} is selected.`,
            };
        } else {
            return undefined;
        }
    }

    if (!isActiveForSelectedReferenceName(selectedReferenceNames, field)) {
        return {
            type: fieldItemDisplayStateType.disabled,
            tooltip: `This is only visible when the ${referenceIdentifierField ?? 'referenceIdentifierField'} ${field.onlyForReference} is selected.`,
        };
    }

    return undefined;
}
