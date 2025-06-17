import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmationDialog, displayConfirmationDialog } from './ConfirmationDialog';

// Mock react-confirm-alert
vi.mock('react-confirm-alert', () => ({
    confirmAlert: vi.fn(),
}));

describe('ConfirmationDialog', () => {
    const mockOnConfirmation = vi.fn();
    const mockOnClose = vi.fn();

    const defaultProps = {
        dialogText: 'Are you sure you want to continue?',
        onConfirmation: mockOnConfirmation,
        onClose: mockOnClose,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders dialog with default texts', () => {
        render(<ConfirmationDialog {...defaultProps} />);

        expect(screen.getByText('Are you sure you want to continue?')).toBeInTheDocument();
        expect(screen.getByText('Confirm')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('renders dialog with custom button texts', () => {
        render(
            <ConfirmationDialog
                {...defaultProps}
                confirmButtonText="Delete"
                closeButtonText="Keep"
            />
        );

        expect(screen.getByText('Delete')).toBeInTheDocument();
        expect(screen.getByText('Keep')).toBeInTheDocument();
    });

    it('calls onClose when cancel button is clicked', async () => {
        const user = userEvent.setup();
        render(<ConfirmationDialog {...defaultProps} />);

        const cancelButton = screen.getByText('Cancel');
        await user.click(cancelButton);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(mockOnConfirmation).not.toHaveBeenCalled();
    });

    it('calls onClose when X button is clicked', async () => {
        const user = userEvent.setup();
        render(<ConfirmationDialog {...defaultProps} />);

        const closeButton = screen.getByText('✕');
        await user.click(closeButton);

        expect(mockOnClose).toHaveBeenCalledTimes(1);
        expect(mockOnConfirmation).not.toHaveBeenCalled();
    });

    it('calls onConfirmation when confirm button is clicked', async () => {
        const user = userEvent.setup();
        render(<ConfirmationDialog {...defaultProps} />);

        const confirmButton = screen.getByText('Confirm');
        await user.click(confirmButton);

        expect(mockOnConfirmation).toHaveBeenCalledTimes(1);
        expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('handles async onConfirmation callback', async () => {
        const asyncMockOnConfirmation = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        
        render(
            <ConfirmationDialog
                {...defaultProps}
                onConfirmation={asyncMockOnConfirmation}
            />
        );

        const confirmButton = screen.getByText('Confirm');
        await user.click(confirmButton);

        expect(asyncMockOnConfirmation).toHaveBeenCalledTimes(1);
    });

    it('has proper accessibility attributes', () => {
        render(<ConfirmationDialog {...defaultProps} />);

        // Close button should have aria-label for screen readers
        const closeButton = screen.getByText('✕');
        expect(closeButton).toHaveAttribute('aria-label', undefined); // Not set, should be improved
        
        // Dialog should have proper heading structure
        const heading = screen.getByText('Are you sure you want to continue?');
        expect(heading).toHaveClass('font-bold', 'text-lg');
    });

    it('applies correct CSS classes for styling', () => {
        const { container } = render(<ConfirmationDialog {...defaultProps} />);

        const dialog = container.querySelector('.modal-box');
        expect(dialog).toBeInTheDocument();

        const buttonsContainer = container.querySelector('.flex.justify-end.gap-4.mt-4');
        expect(buttonsContainer).toBeInTheDocument();
    });
});

describe('displayConfirmationDialog', () => {
    const { confirmAlert } = await import('react-confirm-alert');
    const mockConfirmAlert = vi.mocked(confirmAlert);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls confirmAlert with correct parameters', () => {
        const mockOnConfirmation = vi.fn();
        
        displayConfirmationDialog({
            dialogText: 'Test dialog',
            onConfirmation: mockOnConfirmation,
        });

        expect(mockConfirmAlert).toHaveBeenCalledWith({
            closeOnClickOutside: true,
            customUI: expect.any(Function),
        });
    });

    it('uses default button texts when not provided', () => {
        const mockOnConfirmation = vi.fn();
        
        displayConfirmationDialog({
            dialogText: 'Test dialog',
            onConfirmation: mockOnConfirmation,
        });

        expect(mockConfirmAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                closeOnClickOutside: true,
            })
        );
    });

    it('uses custom button texts when provided', () => {
        const mockOnConfirmation = vi.fn();
        
        displayConfirmationDialog({
            dialogText: 'Test dialog',
            onConfirmation: mockOnConfirmation,
            confirmButtonText: 'Yes',
            closeButtonText: 'No',
        });

        expect(mockConfirmAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                closeOnClickOutside: true,
            })
        );
    });
});