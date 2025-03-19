import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InputField, type Row } from './InputField';
import userEvent from '@testing-library/user-event';

const mockRow: Row = {
    value: '',
    key: 'test-key',
    warnings: [],
    errors: [],
    initialValue: 'initial',
};

const mockOnChange = vi.fn();

describe('InputField', () => {
    it('renders input field correctly', () => {
        render(<InputField row={{ ...mockRow, value: 'test' }} onChange={mockOnChange} colorClassName='' options={undefined} />);
        expect(screen.getByRole('textbox')).toHaveValue('test');
    });

    it('calls onChange when input value changes', () => {
        render(<InputField row={mockRow} onChange={mockOnChange} colorClassName='' options={undefined} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new value' } });
        expect(mockOnChange).toHaveBeenCalledWith({ ...mockRow, value: 'new value' });
    });

    it('renders combobox when options are provided', () => {
        const options = [{ name: 'Option 1' }, { name: 'Option 2' }];
        render(<InputField row={mockRow} onChange={mockOnChange} colorClassName='' options={options} />);
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('calls onChange when a combobox option is clicked', async () => {
        const options = [{ name: 'Option 1' }, { name: 'Option 2' }];
        render(<InputField row={mockRow} onChange={mockOnChange} colorClassName='' options={options} />);
        await userEvent.click(screen.getByRole('combobox'));
        expect(screen.getByRole('listbox'), 'options box should be there').toBeInTheDocument();
        const optionElements = await screen.findAllByRole('option');
        expect(optionElements).toHaveLength(2);
        await userEvent.click(screen.getByText(/Option 1/));
        expect(mockOnChange).toHaveBeenCalledWith({ ...mockRow, value: 'Option 1' });
    });

    it('reverts value when undo button is clicked', () => {
        render(
            <InputField
                row={{ ...mockRow, value: 'changed' }}
                onChange={mockOnChange}
                colorClassName=''
                options={undefined}
            />,
        );
        fireEvent.click(screen.getByRole('button'));
        expect(mockOnChange).toHaveBeenCalledWith({ ...mockRow, value: 'initial' });
    });
});
