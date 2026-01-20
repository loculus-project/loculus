import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FieldSelectorModal, getDefaultSelectedFields } from './FieldSelectorModal';
import { ACCESSION_VERSION_FIELD } from '../../../../settings';
import { type Metadata } from '../../../../types/config';
import { MetadataVisibility } from '../../../../utils/search.ts';
import type { SegmentReferenceSelections } from '../../../../utils/sequenceTypeHelpers.ts';

// Mock BaseDialog component
vi.mock('../../../common/BaseDialog.tsx', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    BaseDialog: vi.fn(({ children, title, isOpen }) => {
        if (!isOpen) return null;
        return (
            <div data-testid='mock-base-dialog'>
                <h3>{title}</h3>
                {children}
            </div>
        );
    }),
}));

describe('FieldSelectorModal', () => {
    const normalFields: Metadata[] = [
        {
            name: 'field1',
            displayName: 'Field 1',
            type: 'string',
            header: 'Group 1',
            includeInDownloadsByDefault: true,
        },
        {
            name: 'field2',
            displayName: 'Field 2',
            type: 'string',
            header: 'Group 1',
            includeInDownloadsByDefault: false,
        },
        {
            name: 'field3',
            displayName: 'Field 3',
            type: 'string',
            header: 'Group 2',
            includeInDownloadsByDefault: true,
        },
        {
            name: 'field4',
            displayName: 'Field 4',
            type: 'string',
            header: 'Group 2',
            hideOnSequenceDetailsPage: true,
            includeInDownloadsByDefault: true,
        },
    ];
    const accessionVersionField: Metadata & { renderedDisplayName: string } = {
        name: ACCESSION_VERSION_FIELD,
        displayName: 'Accession Version',
        renderedDisplayName: 'Accession Version (always included)',
        type: 'string',
        header: 'Group 1',
        includeInDownloadsByDefault: true,
    };
    const mockMetadata: Metadata[] = [...normalFields, accessionVersionField];

    describe('getDefaultSelectedFields', () => {
        it('returns fields with includeInDownloadsByDefault set to true and always includes ACCESSION_VERSION_FIELD', () => {
            const result = getDefaultSelectedFields(mockMetadata);
            // Should include all fields with includeInDownloadsByDefault=true and ACCESSION_VERSION_FIELD
            expect(result).toContain('field1');
            expect(result).toContain('field3');
            expect(result).toContain('field4');
            expect(result).toContain(ACCESSION_VERSION_FIELD);
        });

        it('always includes ACCESSION_VERSION_FIELD even if no fields match criteria', () => {
            const result = getDefaultSelectedFields([
                { name: 'field1', type: 'string', includeInDownloadsByDefault: false },
                { name: 'field2', type: 'string', hideOnSequenceDetailsPage: true, includeInDownloadsByDefault: false },
            ]);
            expect(result).toEqual(new Set([ACCESSION_VERSION_FIELD]));
        });
    });

    describe('FieldSelectorModal component', () => {
        it('renders all fields grouped by header', () => {
            renderFieldSelectorModal();

            // Check headers are rendered
            expect(screen.getByText('Group 1')).toBeInTheDocument();
            expect(screen.getByText('Group 2')).toBeInTheDocument();

            // Check fields are rendered (including previously hidden fields)
            for (const field of normalFields) {
                expect(screen.getByText(field.displayName!)).toBeInTheDocument();
            }
            expect(screen.getByText(accessionVersionField.renderedDisplayName)).toBeInTheDocument();
        });

        it('has ACCESSION_VERSION_FIELD checked and disabled', () => {
            renderFieldSelectorModal();

            const checkbox = screen.getByLabelText(accessionVersionField.renderedDisplayName);
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
        });

        it('calls onSelectedFieldsChange immediately when a field is toggled and ACCESSION_VERSION_FIELD is always included', () => {
            const { getCurrentSelectedFields } = renderFieldSelectorModal();

            // Toggle one of the selected fields to unselect it
            fireEvent.click(screen.getByLabelText('Field 1'));

            expect(getCurrentSelectedFields()).toEqual(new Set(['field3', 'field4', ACCESSION_VERSION_FIELD]));

            // Toggle another field to select it
            fireEvent.click(screen.getByLabelText('Field 2'));

            expect(getCurrentSelectedFields()).toEqual(
                new Set(['field3', 'field4', 'field2', ACCESSION_VERSION_FIELD]),
            );
        });

        it('selects all fields when "Select all" is clicked', async () => {
            const { rerender, getCurrentSelectedFields } = renderFieldSelectorModal();

            fireEvent.click(screen.getByText('Select all'));

            rerender();

            expect(getCurrentSelectedFields()).toEqual(
                new Set(['field1', 'field2', 'field3', 'field4', ACCESSION_VERSION_FIELD]),
            );

            const normalInputs = normalFields.map((field) => screen.getByLabelText(field.displayName!));
            for (const input of normalInputs) {
                await waitFor(() => expect(input).toBeChecked());
            }

            const accessionVersionInput = screen.getByLabelText(accessionVersionField.renderedDisplayName);
            expect(accessionVersionInput).toBeChecked();
        });

        it('unselects all except accession version when "Select none" is clicked', () => {
            const { rerender, getCurrentSelectedFields } = renderFieldSelectorModal();

            fireEvent.click(screen.getByText('Select none'));

            rerender();

            expect(getCurrentSelectedFields()).toEqual(new Set([ACCESSION_VERSION_FIELD]));

            const normalInputs = normalFields.map((field) => screen.getByLabelText(field.displayName!));
            normalInputs.forEach((input) => {
                expect(input).not.toBeChecked();
            });

            const accessionVersionInput = screen.getByLabelText(accessionVersionField.renderedDisplayName);
            expect(accessionVersionInput).toBeChecked();
        });

        it('should disable fields that are not for the currently selected suborganism', () => {
            renderFieldSelectorModal({ main: 'suborganism1' }, [
                {
                    name: 'field1',
                    displayName: 'Field 1',
                    type: 'string',
                    header: 'Group 1',
                    includeInDownloadsByDefault: true,
                },
                {
                    name: 'field2',
                    displayName: 'Field 2',
                    type: 'string',
                    header: 'Group 1',
                    includeInDownloadsByDefault: true,
                    onlyForReference: 'suborganism1',
                },
                {
                    name: 'field3',
                    displayName: 'Field 3',
                    type: 'string',
                    header: 'Group 2',
                    includeInDownloadsByDefault: true,
                    onlyForReference: 'suborganism2',
                },
                accessionVersionField,
            ]);

            expect(screen.getByLabelText(accessionVersionField.renderedDisplayName)).toBeChecked();
            expect(screen.getByLabelText('Field 1')).toBeChecked();
            expect(screen.getByLabelText('Field 2')).toBeChecked();
            expect(screen.getByLabelText('Field 3')).not.toBeChecked();
        });
    });

    function renderFieldSelectorModal(
        selectedReferenceNames: SegmentReferenceSelections = { main: null },
        metadata: Metadata[] = mockMetadata,
    ) {
        const { result } = renderHook(() => useState(getDefaultSelectedFields(metadata)));

        const getComponent = () => (
            <FieldSelectorModal
                isOpen={true}
                onClose={() => {}}
                schema={{
                    defaultOrder: 'ascending',
                    defaultOrderBy: '',
                    inputFields: [],
                    organismName: 'dummy',
                    primaryKey: ACCESSION_VERSION_FIELD,
                    submissionDataTypes: {
                        consensusSequences: true,
                    },
                    tableColumns: [],
                    metadata,
                }}
                downloadFieldVisibilities={
                    new Map(
                        metadata.map((field) => [
                            field.name,
                            new MetadataVisibility(result.current[0].has(field.name), field.onlyForReference),
                        ]),
                    )
                }
                onSelectedFieldsChange={result.current[1]}
                selectedReferenceNames={selectedReferenceNames}
            />
        );

        const { rerender } = render(getComponent());

        return {
            rerender: () => rerender(getComponent()),
            getCurrentSelectedFields: () => result.current[0],
        };
    }
});
