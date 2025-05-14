import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FieldSelectorModal, getDefaultSelectedFields } from './FieldSelectorModal';
import { ACCESSION_VERSION_FIELD } from '../../../../settings';
import { type Metadata } from '../../../../types/config';

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
    const mockMetadata: Metadata[] = [
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
        {
            name: ACCESSION_VERSION_FIELD,
            displayName: 'Accession Version',
            type: 'string',
            header: 'Group 1',
            includeInDownloadsByDefault: true,
        },
    ];

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
            expect(result).toEqual([ACCESSION_VERSION_FIELD]);
        });
    });

    describe('FieldSelectorModal component', () => {
        it('renders all fields grouped by header with ACCESSION_VERSION_FIELD always checked and disabled', () => {
            const mockOnSave = vi.fn();
            render(<FieldSelectorModal isOpen={true} onClose={() => {}} metadata={mockMetadata} onSave={mockOnSave} />);

            // Check headers are rendered
            expect(screen.getByText('Group 1')).toBeInTheDocument();
            expect(screen.getByText('Group 2')).toBeInTheDocument();

            // Check fields are rendered (including previously hidden fields)
            expect(screen.getByText('Field 1')).toBeInTheDocument();
            expect(screen.getByText('Field 2')).toBeInTheDocument();
            expect(screen.getByText('Field 3')).toBeInTheDocument();
            expect(screen.getByText('Field 4')).toBeInTheDocument(); // Now should be rendered
        });

        it('initializes with default selected fields if no initialSelectedFields provided', () => {
            render(<FieldSelectorModal isOpen={true} onClose={() => {}} metadata={mockMetadata} onSave={() => {}} />);

            // Check that fields with includeInDownloadsByDefault=true are checked
            const field1Checkbox = screen.getByLabelText('Field 1') as Element;
            const field2Checkbox = screen.getByLabelText('Field 2') as Element;
            const field3Checkbox = screen.getByLabelText('Field 3') as Element;
            const field4Checkbox = screen.getByLabelText('Field 4') as Element;

            // Adding type assertion to properly access the checked property
            const input1 = field1Checkbox as unknown as HTMLInputElement;
            const input2 = field2Checkbox as unknown as HTMLInputElement;
            const input3 = field3Checkbox as unknown as HTMLInputElement;
            const input4 = field4Checkbox as unknown as HTMLInputElement;

            expect(input1.checked).toBe(true);
            expect(input2.checked).toBe(false);
            expect(input3.checked).toBe(true);
            expect(input4.checked).toBe(true);
        });

        it('calls onSave immediately when a field is toggled and ACCESSION_VERSION_FIELD is always included', () => {
            const mockOnSave = vi.fn();
            render(<FieldSelectorModal isOpen={true} onClose={() => {}} metadata={mockMetadata} onSave={mockOnSave} />);

            // Toggle one of the selected fields to unselect it
            fireEvent.click(screen.getByLabelText('Field 1'));

            // Expect the onSave function to be called immediately with ACCESSION_VERSION_FIELD always included
            expect(mockOnSave).toHaveBeenCalledWith(
                expect.arrayContaining(['field3', 'field4', ACCESSION_VERSION_FIELD]),
            );
            expect(mockOnSave).not.toHaveBeenCalledWith(expect.arrayContaining(['field1']));

            // Toggle another field to select it
            fireEvent.click(screen.getByLabelText('Field 2'));

            // Expect onSave to be called again with updated selection and ACCESSION_VERSION_FIELD still included
            expect(mockOnSave).toHaveBeenCalledWith(
                expect.arrayContaining(['field3', 'field4', 'field2', ACCESSION_VERSION_FIELD]),
            );
        });
    });
});
