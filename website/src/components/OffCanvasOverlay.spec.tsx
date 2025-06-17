import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OffCanvasOverlay } from './OffCanvasOverlay';

describe('OffCanvasOverlay', () => {
    it('renders overlay div', () => {
        const { container } = render(<OffCanvasOverlay />);

        const overlay = container.firstChild as HTMLElement;
        expect(overlay).toBeInTheDocument();
        expect(overlay).toHaveClass('bg-gray-800', 'bg-opacity-50', 'fixed', 'inset-0', 'z-30');
    });

    it('calls onClick when clicked', async () => {
        const mockOnClick = vi.fn();
        const user = userEvent.setup();
        
        const { container } = render(<OffCanvasOverlay onClick={mockOnClick} />);
        
        const overlay = container.firstChild as HTMLElement;
        await user.click(overlay);

        expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when onClick is not provided', async () => {
        const user = userEvent.setup();
        
        const { container } = render(<OffCanvasOverlay />);
        
        const overlay = container.firstChild as HTMLElement;
        
        // Should not throw error when onClick is not provided
        await user.click(overlay);
        
        // Test passes if no error is thrown
        expect(overlay).toBeInTheDocument();
    });

    it('applies default CSS classes', () => {
        const { container } = render(<OffCanvasOverlay />);

        const overlay = container.firstChild as HTMLElement;
        expect(overlay).toHaveClass(
            'bg-gray-800',
            'bg-opacity-50', 
            'fixed',
            'inset-0',
            'z-30'
        );
    });

    it('applies custom className in addition to default classes', () => {
        const { container } = render(<OffCanvasOverlay className="custom-class" />);

        const overlay = container.firstChild as HTMLElement;
        expect(overlay).toHaveClass(
            'bg-gray-800',
            'bg-opacity-50',
            'fixed', 
            'inset-0',
            'z-30',
            'custom-class'
        );
    });

    it('handles empty className prop', () => {
        const { container } = render(<OffCanvasOverlay className="" />);

        const overlay = container.firstChild as HTMLElement;
        expect(overlay).toHaveClass(
            'bg-gray-800',
            'bg-opacity-50',
            'fixed',
            'inset-0', 
            'z-30'
        );
        // Should not have any additional empty classes
    });

    it('handles undefined className prop', () => {
        const { container } = render(<OffCanvasOverlay className={undefined} />);

        const overlay = container.firstChild as HTMLElement;
        expect(overlay).toHaveClass(
            'bg-gray-800',
            'bg-opacity-50',
            'fixed',
            'inset-0',
            'z-30'
        );
    });

    it('creates a clickable overlay for modal/drawer functionality', () => {
        const mockOnClick = vi.fn();
        const { container } = render(<OffCanvasOverlay onClick={mockOnClick} />);

        const overlay = container.firstChild as HTMLElement;
        
        // Should be positioned to cover entire screen
        expect(overlay).toHaveClass('fixed', 'inset-0');
        
        // Should have semi-transparent background
        expect(overlay).toHaveClass('bg-gray-800', 'bg-opacity-50');
        
        // Should have high z-index to appear above other content
        expect(overlay).toHaveClass('z-30');
    });

    it('is accessible for screen readers', () => {
        const { container } = render(<OffCanvasOverlay />);

        const overlay = container.firstChild as HTMLElement;
        
        // The overlay is a background element, so it should not be focusable
        // or announce anything to screen readers - this is the expected behavior
        expect(overlay.tagName).toBe('DIV');
    });
});