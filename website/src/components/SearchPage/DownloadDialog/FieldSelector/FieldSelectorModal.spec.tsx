import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FieldSelectorModal, getDefaultSelectedFields } from './FieldSelectorModal';
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
    ];

    describe('getDefaultSelectedFields', () => {
        it('returns fields with includeInDownloadsByDefault set to true and not hidden', () => {
            const result = getDefaultSelectedFields(mockMetadata);
            expect(result).toEqual(['field1', 'field3']); // field4 is hidden
        });

        it('returns empty array if no fields match criteria', () => {
            const result = getDefaultSelectedFields([
                { name: 'field1', type: 'string', includeInDownloadsByDefault: false },
                { name: 'field2', type: 'string', hideOnSequenceDetailsPage: true, includeInDownloadsByDefault: true },
            ]);
            expect(result).toEqual([]);
        });
    });

    describe('FieldSelectorModal component', () => {
        it('renders all visible fields grouped by header', () => {
            const mockOnSave = vi.fn();
            render(<FieldSelectorModal isOpen={true} onClose={() => {}} metadata={mockMetadata} onSave={mockOnSave} />);

            // Check headers are rendered
            expect(screen.getByText('Group 1')).toBeInTheDocument();
            expect(screen.getByText('Group 2')).toBeInTheDocument();

            // Check fields are rendered (excluding hidden fields)
            expect(screen.getByText('Field 1')).toBeInTheDocument();
            expect(screen.getByText('Field 2')).toBeInTheDocument();
            expect(screen.getByText('Field 3')).toBeInTheDocument();
            expect(screen.queryByText('Field 4')).not.toBeInTheDocument(); // Hidden field should not be rendered
        });

        it('initializes with default selected fields if no initialSelectedFields provided', () => {
            render(<FieldSelectorModal isOpen={true} onClose={() => {}} metadata={mockMetadata} onSave={() => {}} />);

            // Check that fields with includeInDownloadsByDefault=true are checked
            const field1Checkbox = screen.getByLabelText('Field 1');
            const field2Checkbox = screen.getByLabelText('Field 2');
            const field3Checkbox = screen.getByLabelText('Field 3');

            expect(field1Checkbox.checked).toBe(true);
            expect(field2Checkbox.checked).toBe(false);
            expect(field3Checkbox.checked).toBe(true);
        });

        it('calls onSave immediately when a field is toggled', () => {
            const mockOnSave = vi.fn();
            render(<FieldSelectorModal isOpen={true} onClose={() => {}} metadata={mockMetadata} onSave={mockOnSave} />);

            // Toggle one of the selected fields to unselect it
            fireEvent.click(screen.getByLabelText('Field 1'));

            // Expect the onSave function to be called immediately
            expect(mockOnSave).toHaveBeenCalledWith(['field3']);

            // Toggle another field to select it
            fireEvent.click(screen.getByLabelText('Field 2'));

            // Expect onSave to be called again with updated selection
            expect(mockOnSave).toHaveBeenCalledWith(['field3', 'field2']);
        });
    });
});
