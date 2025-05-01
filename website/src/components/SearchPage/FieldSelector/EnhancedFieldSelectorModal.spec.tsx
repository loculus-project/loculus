import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EnhancedFieldSelectorModal, metadataToFields, nameToLabelMapToFields } from './EnhancedFieldSelectorModal';

describe('EnhancedFieldSelectorModal', () => {
    const mockFields = [
        { name: 'field1', displayName: 'Field 1' },
        { name: 'field2', displayName: 'Field 2' },
        { name: 'field3', displayName: 'Field 3', header: 'Group A' },
        { name: 'field4', displayName: 'Field 4', header: 'Group A' },
        { name: 'field5', displayName: 'Field 5', header: 'Group B' },
    ];

    it('renders with basic props', () => {
        const onClose = vi.fn();
        render(
            <EnhancedFieldSelectorModal 
                isOpen={true}
                onClose={onClose}
                title="Test Modal"
                fields={mockFields}
                selectedFields={['field1']}
                onSave={vi.fn()}
            />
        );

        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Field 1')).toBeInTheDocument();
        expect(screen.getByText('Field 2')).toBeInTheDocument();
        expect(screen.getByText('Group A')).toBeInTheDocument();
        expect(screen.getByText('Group B')).toBeInTheDocument();
    });

    it('supports visibilityMap and onToggleVisibility', () => {
        const onToggleVisibility = vi.fn();
        const visibilityMap = new Map([
            ['field1', true],
            ['field2', false],
            ['field3', true],
            ['field4', false],
            ['field5', false],
        ]);

        render(
            <EnhancedFieldSelectorModal 
                isOpen={true}
                onClose={vi.fn()}
                title="Test Modal"
                fields={mockFields}
                visibilityMap={visibilityMap}
                onToggleVisibility={onToggleVisibility}
            />
        );

        // Check initial checkboxes
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).toBeChecked(); // field1
        expect(checkboxes[1]).not.toBeChecked(); // field2

        // Toggle field2
        fireEvent.click(checkboxes[1]);
        expect(onToggleVisibility).toHaveBeenCalledWith('field2', true);
    });

    it('disables always present fields', () => {
        render(
            <EnhancedFieldSelectorModal 
                isOpen={true}
                onClose={vi.fn()}
                title="Test Modal"
                fields={mockFields}
                selectedFields={['field1']}
                onSave={vi.fn()}
                alwaysPresentFieldNames={['field1']}
            />
        );

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes[0]).toBeDisabled(); // field1
        expect(checkboxes[1]).not.toBeDisabled(); // field2
    });

    it('hides categories when showCategories is false', () => {
        render(
            <EnhancedFieldSelectorModal 
                isOpen={true}
                onClose={vi.fn()}
                title="Test Modal"
                fields={mockFields}
                selectedFields={['field1']}
                onSave={vi.fn()}
                showCategories={false}
            />
        );

        expect(screen.queryByText('Group A')).not.toBeInTheDocument();
        expect(screen.queryByText('Group B')).not.toBeInTheDocument();
    });

    it('supports Select All/None actions', () => {
        const onSave = vi.fn();
        render(
            <EnhancedFieldSelectorModal 
                isOpen={true}
                onClose={vi.fn()}
                title="Test Modal"
                fields={mockFields}
                selectedFields={['field1']}
                onSave={onSave}
            />
        );

        // Click Select All
        fireEvent.click(screen.getByText('Select All'));
        expect(onSave).toHaveBeenCalledWith(expect.arrayContaining(['field1', 'field2', 'field3', 'field4', 'field5']));

        // Click Select None
        fireEvent.click(screen.getByText('Select None'));
        expect(onSave).toHaveBeenCalledWith(expect.arrayContaining([]));
    });

    describe('Helper functions', () => {
        it('metadataToFields converts Metadata array to fields', () => {
            const metadata = [
                { name: 'field1', displayName: 'Field 1', type: 'string' as const, header: 'Group A', order: 1 },
                { name: 'field2', displayName: 'Field 2', type: 'string' as const },
            ];

            const result = metadataToFields(metadata);
            expect(result).toEqual([
                { name: 'field1', displayName: 'Field 1', header: 'Group A', order: 1, alwaysIncluded: false },
                { name: 'field2', displayName: 'Field 2', alwaysIncluded: false },
            ]);
        });

        it('nameToLabelMapToFields converts name/label map to fields', () => {
            const nameToLabelMap = {
                field1: 'Field 1',
                field2: 'Field 2',
            };

            const result = nameToLabelMapToFields(nameToLabelMap);
            expect(result).toEqual([
                { name: 'field1', displayName: 'Field 1' },
                { name: 'field2', displayName: 'Field 2' },
            ]);
        });
    });
});