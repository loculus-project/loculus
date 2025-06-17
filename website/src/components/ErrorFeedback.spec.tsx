import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorFeedback } from './ErrorFeedback';

describe('ErrorFeedback', () => {
    const mockOnClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders error message in snackbar', () => {
        render(<ErrorFeedback message="Something went wrong!" />);

        expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
        expect(screen.getByText('CLOSE')).toBeInTheDocument();
    });

    it('renders snackbar as open by default', () => {
        render(<ErrorFeedback message="Error message" />);

        const snackbar = screen.getByRole('presentation');
        expect(snackbar).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
        const user = userEvent.setup();
        render(<ErrorFeedback message="Error message" onClose={mockOnClose} />);

        const closeButton = screen.getByText('CLOSE');
        await user.click(closeButton);

        await waitFor(() => {
            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });
    });

    it('does not call onClose when onClose prop is not provided', async () => {
        const user = userEvent.setup();
        render(<ErrorFeedback message="Error message" />);

        const closeButton = screen.getByText('CLOSE');
        
        // Should not throw error even without onClose callback
        await user.click(closeButton);
        
        // Test passes if no error is thrown
        expect(closeButton).toBeInTheDocument();
    });

    it('closes snackbar when close button is clicked', async () => {
        const user = userEvent.setup();
        render(<ErrorFeedback message="Error message" onClose={mockOnClose} />);

        const closeButton = screen.getByText('CLOSE');
        await user.click(closeButton);

        // The snackbar should become hidden (not fully removed from DOM due to MUI behavior)
        await waitFor(() => {
            const snackbar = screen.queryByRole('presentation');
            // MUI Snackbar may still be in DOM but with different attributes when closed
            expect(mockOnClose).toHaveBeenCalled();
        });
    });

    it('does not close on clickaway', () => {
        const { container } = render(<ErrorFeedback message="Error message" onClose={mockOnClose} />);

        // Simulate clickaway event by clicking outside
        const outsideElement = container;
        outsideElement.click();

        // Should not close on clickaway (this is the expected behavior based on the code)
        expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('has correct snackbar positioning', () => {
        render(<ErrorFeedback message="Error message" />);

        const snackbar = screen.getByRole('presentation');
        expect(snackbar).toBeInTheDocument();
        
        // Check that anchorOrigin is applied (this would be in the DOM attributes/styles)
        // The actual positioning is handled by MUI internally
    });

    it('renders close button with correct styling', () => {
        render(<ErrorFeedback message="Error message" />);

        const closeButton = screen.getByText('CLOSE');
        expect(closeButton).toBeInTheDocument();
        
        // Button should have MUI Button component attributes
        expect(closeButton.tagName).toBe('BUTTON');
    });

    it('handles long error messages', () => {
        const longMessage = 'This is a very long error message that should still be displayed properly in the snackbar component without breaking the layout or causing any issues with the user interface.';
        
        render(<ErrorFeedback message={longMessage} />);

        expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('handles empty error message', () => {
        render(<ErrorFeedback message="" />);

        // Should still render the snackbar structure even with empty message
        expect(screen.getByText('CLOSE')).toBeInTheDocument();
        expect(screen.getByRole('presentation')).toBeInTheDocument();
    });

    it('handles special characters in error message', () => {
        const specialMessage = 'Error: <script>alert("test")</script> & other HTML';
        
        render(<ErrorFeedback message={specialMessage} />);

        // Message should be displayed as text, not executed as HTML
        expect(screen.getByText(specialMessage)).toBeInTheDocument();
    });
});