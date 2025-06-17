import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SandwichMenu } from './SandwichMenu';

// Mock the useOffCanvas hook
vi.mock('../../hooks/useOffCanvas', () => ({
    useOffCanvas: vi.fn(),
}));

// Mock child components
vi.mock('../OffCanvasOverlay', () => ({
    OffCanvasOverlay: ({ onClick }: { onClick: () => void }) => (
        <div data-testid="off-canvas-overlay" onClick={onClick}>
            Overlay
        </div>
    ),
}));

vi.mock('../SandwichIcon', () => ({
    SandwichIcon: ({ isOpen }: { isOpen: boolean }) => (
        <div data-testid="sandwich-icon" data-open={isOpen}>
            {isOpen ? 'Open' : 'Closed'} Icon
        </div>
    ),
}));

describe('SandwichMenu', () => {
    const mockToggle = vi.fn();
    const mockClose = vi.fn();
    const mockUseOffCanvas = vi.fn();

    const defaultProps = {
        topNavigationItems: [
            { text: 'Home', path: '/' },
            { text: 'Search', path: '/search' },
            { text: 'Submit', path: '/submit' },
        ],
        gitHubMainUrl: 'https://github.com/loculus-project/loculus',
        siteName: 'Loculus',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseOffCanvas.mockReturnValue({
            isOpen: false,
            toggle: mockToggle,
            close: mockClose,
        });
        vi.mocked(vi.importActual('../../hooks/useOffCanvas')).useOffCanvas = mockUseOffCanvas;
    });

    it('renders menu button when closed', () => {
        render(<SandwichMenu {...defaultProps} />);

        expect(screen.getByRole('button', { name: 'Open main menu' })).toBeInTheDocument();
        expect(screen.getByTestId('sandwich-icon')).toHaveAttribute('data-open', 'false');
    });

    it('renders overlay when open', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} />);

        expect(screen.getByTestId('off-canvas-overlay')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close main menu' })).toBeInTheDocument();
    });

    it('toggles menu when open button is clicked', async () => {
        const user = userEvent.setup();
        render(<SandwichMenu {...defaultProps} />);

        const openButton = screen.getByRole('button', { name: 'Open main menu' });
        await user.click(openButton);

        expect(mockToggle).toHaveBeenCalledTimes(1);
    });

    it('closes menu when close button is clicked', async () => {
        const user = userEvent.setup();
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} />);

        const closeButton = screen.getByRole('button', { name: 'Close main menu' });
        await user.click(closeButton);

        expect(mockToggle).toHaveBeenCalledTimes(1);
    });

    it('closes menu when overlay is clicked', async () => {
        const user = userEvent.setup();
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} />);

        const overlay = screen.getByTestId('off-canvas-overlay');
        await user.click(overlay);

        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('renders site name as home link', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} />);

        const homeLink = screen.getByRole('link', { name: 'Loculus' });
        expect(homeLink).toHaveAttribute('href', '/');
    });

    it('renders top navigation items', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} />);

        expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
        expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/search');
        expect(screen.getByRole('link', { name: 'Submit' })).toHaveAttribute('href', '/submit');
    });

    it('renders GitHub link with correct URL', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} />);

        const githubLink = screen.getByRole('link', { name: 'GitHub logo' });
        expect(githubLink).toHaveAttribute('href', 'https://github.com/loculus-project/loculus');
    });

    it('uses default GitHub URL when not provided', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} gitHubMainUrl={undefined} />);

        const githubLink = screen.getByRole('link', { name: 'GitHub logo' });
        expect(githubLink).toHaveAttribute('href', 'https://github.com/loculus-project');
    });

    it('applies correct CSS classes for open state', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        const { container } = render(<SandwichMenu {...defaultProps} />);

        const menu = container.querySelector('.translate-x-0');
        expect(menu).toBeInTheDocument();
        expect(menu).toHaveClass('fixed', 'top-0', 'right-0', 'bg-white', 'w-64', 'min-h-screen');
    });

    it('applies correct CSS classes for closed state', () => {
        const { container } = render(<SandwichMenu {...defaultProps} />);

        const menu = container.querySelector('.translate-x-full');
        expect(menu).toBeInTheDocument();
        expect(menu).toHaveClass('fixed', 'top-0', 'right-0', 'bg-white', 'w-64', 'min-h-screen');
    });

    it('handles empty navigation items', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        render(<SandwichMenu {...defaultProps} topNavigationItems={[]} />);

        // Should still render the menu structure
        expect(screen.getByRole('link', { name: 'Loculus' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'GitHub logo' })).toBeInTheDocument();
    });

    it('has proper accessibility attributes', () => {
        render(<SandwichMenu {...defaultProps} />);

        const openButton = screen.getByRole('button', { name: 'Open main menu' });
        expect(openButton).toHaveAttribute('aria-label', 'Open main menu');
    });

    it('renders navigation items with correct indentation', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        const { container } = render(<SandwichMenu {...defaultProps} />);

        // Check that navigation items have proper indentation classes
        const navItems = container.querySelectorAll('.ml-4');
        expect(navItems.length).toBeGreaterThan(0);
    });

    it('handles navigation items with false path', () => {
        mockUseOffCanvas.mockReturnValue({
            isOpen: true,
            toggle: mockToggle,
            close: mockClose,
        });

        const propsWithFalsePath = {
            ...defaultProps,
            topNavigationItems: [
                ...defaultProps.topNavigationItems,
                { text: 'Disabled Item', path: false as const },
            ],
        };

        render(<SandwichMenu {...propsWithFalsePath} />);

        // Should render text without link
        expect(screen.getByText('Disabled Item')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Disabled Item' })).not.toBeInTheDocument();
    });
});