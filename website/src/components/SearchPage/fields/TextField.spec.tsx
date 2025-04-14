import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { TextField } from './TextField';

describe('TextField', () => {
    it('renders a single-line text field correctly', () => {
        render(<TextField label='Test Field' />);

        const input = screen.getByLabelText('Test Field');
        expect(input).toBeInTheDocument();
        expect(input.tagName).toBe('INPUT');
    });

    it('renders a multiline text field correctly', () => {
        render(<TextField label='Test Field' multiline={true} />);

        const textarea = screen.getByLabelText('Test Field');
        expect(textarea).toBeInTheDocument();
        expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('calls onChange when value changes', async () => {
        const handleChange = vi.fn();
        render(<TextField label='Test Field' onChange={handleChange} />);

        const input = screen.getByLabelText('Test Field');
        await userEvent.type(input, 'test');

        expect(handleChange).toHaveBeenCalled();
    });

    it('strips newlines on paste in single-line input', () => {
        const handleChange = vi.fn();
        render(<TextField label='Test Field' onChange={handleChange} />);

        const input = screen.getByLabelText('Test Field');

        // Set up initial test state
        fireEvent.change(input, { target: { value: 'initial' } });
        handleChange.mockClear();

        // Create paste data with newlines
        const pasteData = 'line1\r\nline2\nline3';
        const cleanedData = 'line1line2line3';

        // Create and dispatch a paste event
        fireEvent.paste(input, {
            clipboardData: {
                getData: () => pasteData,
            },
        });

        // Check onChange was called with the cleaned data (without newlines)
        expect(handleChange).toHaveBeenCalled();
        expect(handleChange.mock.calls[0][0].target.value).toContain(cleanedData);
    });

    it('does not strip newlines on paste in multiline textarea', () => {
        const handleChange = vi.fn();
        render(<TextField label='Test Field' multiline={true} onChange={handleChange} />);

        const textarea = screen.getByLabelText('Test Field');

        // Create clipboard data with newlines
        const pasteData = 'line1\r\nline2\nline3';

        // Set initial value
        fireEvent.change(textarea, { target: { value: '' } });

        // Create a clipboard event
        const preventDefaultMock = vi.fn();
        const clipboardEvent = new Event('paste', { bubbles: true });
        Object.defineProperty(clipboardEvent, 'clipboardData', {
            value: {
                getData: () => pasteData,
            },
        });
        Object.defineProperty(clipboardEvent, 'preventDefault', { value: preventDefaultMock });

        // Dispatch the paste event
        textarea.dispatchEvent(clipboardEvent);

        // For multiline inputs, we shouldn't prevent default paste behavior

        expect(preventDefaultMock).not.toHaveBeenCalled();
    });
});
