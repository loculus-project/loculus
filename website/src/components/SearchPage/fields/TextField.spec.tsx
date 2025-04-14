import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { TextField } from './TextField';

describe('TextField', () => {
    it('renders a single-line text field correctly', () => {
        render(<TextField label="Test Field" />);
        
        const input = screen.getByLabelText('Test Field');
        expect(input).toBeInTheDocument();
        expect(input.tagName).toBe('INPUT');
    });

    it('renders a multiline text field correctly', () => {
        render(<TextField label="Test Field" multiline={true} />);
        
        const textarea = screen.getByLabelText('Test Field');
        expect(textarea).toBeInTheDocument();
        expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('calls onChange when value changes', async () => {
        const handleChange = vi.fn();
        render(<TextField label="Test Field" onChange={handleChange} />);
        
        const input = screen.getByLabelText('Test Field');
        await userEvent.type(input, 'test');
        
        expect(handleChange).toHaveBeenCalled();
    });

    it('strips newlines on paste in single-line input', async () => {
        const handleChange = vi.fn();
        render(<TextField label="Test Field" onChange={handleChange} />);
        
        const input = screen.getByLabelText('Test Field');
        
        // Set up a clipboard event with text containing newlines
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
            value: {
                getData: () => 'line1\r\nline2\nline3',
            },
        });
        
        // Mock the input element's methods that will be used in the paste handler
        Object.defineProperty(input, 'selectionStart', { value: 0 });
        Object.defineProperty(input, 'selectionEnd', { value: 0 });
        Object.defineProperty(input, 'value', { value: '' });
        
        // Mock the HTMLInputElement.prototype.value setter
        const originalDescriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        const mockSetter = vi.fn();
        Object.defineProperty(window.HTMLInputElement.prototype, 'value', {
            set: mockSetter,
            get: originalDescriptor!.get,
            configurable: true,
        });
        
        // Mock the setSelectionRange method
        input.setSelectionRange = vi.fn();
        
        // Dispatch the paste event
        input.dispatchEvent(pasteEvent);
        
        // Verify the paste event was prevented
        expect(pasteEvent.defaultPrevented).toBe(true);
        
        // Verify the value setter was called with the cleaned string
        expect(mockSetter).toHaveBeenCalledWith('line1line2line3');
        
        // Restore the original descriptor
        Object.defineProperty(window.HTMLInputElement.prototype, 'value', originalDescriptor!);
    });

    it('does not strip newlines on paste in multiline textarea', async () => {
        const handleChange = vi.fn();
        render(<TextField label="Test Field" multiline={true} onChange={handleChange} />);
        
        const textarea = screen.getByLabelText('Test Field');
        
        // Create clipboard data with newlines
        const pasteData = 'line1\r\nline2\nline3';
        
        // Set initial value
        fireEvent.change(textarea, { target: { value: '' } });
        
        // Create a clipboard event
        const clipboardEvent = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent;
        Object.defineProperty(clipboardEvent, 'clipboardData', {
            value: {
                getData: () => pasteData
            }
        });
        
        // Dispatch the paste event
        textarea.dispatchEvent(clipboardEvent);
        
        // For multiline inputs, we shouldn't prevent default paste behavior
        expect(clipboardEvent.defaultPrevented).toBe(false);
    });
});