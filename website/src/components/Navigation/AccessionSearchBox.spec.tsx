import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AccessionSearchBox } from './AccessionSearchBox';
import { routes } from '../../routes/routes';

describe('AccessionSearchBox', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        Object.defineProperty(window, 'location', {
            value: { href: '' },
            writable: true,
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
        });
    });

    it('renders the search icon button', () => {
        render(<AccessionSearchBox />);

        const searchButton = screen.getByRole('button', { name: /Open accession search/i });
        expect(searchButton).toBeInTheDocument();
        expect(searchButton.querySelector('svg')).toBeInTheDocument();
    });

    it('initially hides the input field when defaultOpen is false', () => {
        render(<AccessionSearchBox />);

        const input = screen.getByPlaceholderText('Search by accession');
        expect(input).toHaveClass('w-0', 'opacity-0', 'pointer-events-none');
    });

    it('shows the input field when defaultOpen is true', () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const input = screen.getByPlaceholderText('Search by accession');
        expect(input).not.toHaveClass('w-0', 'opacity-0', 'pointer-events-none');
        expect(input).toHaveClass('opacity-100');
    });

    it('does not auto focus the input when defaultOpen is true', () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const input = screen.getByPlaceholderText('Search by accession');
        expect(input).not.toHaveFocus();
    });

    it('opens the input field when the search button is clicked', async () => {
        render(<AccessionSearchBox />);

        const searchButton = screen.getByRole('button', { name: /Open accession search/i });
        const input = screen.getByPlaceholderText('Search by accession');

        expect(input).toHaveClass('w-0', 'opacity-0');

        await userEvent.click(searchButton);

        expect(input).not.toHaveClass('w-0', 'opacity-0');
        expect(input).toHaveClass('opacity-100');
    });

    it('focuses the input when opened', async () => {
        render(<AccessionSearchBox />);

        const searchButton = screen.getByRole('button', { name: /Open accession search/i });
        const input = screen.getByPlaceholderText('Search by accession');

        await userEvent.click(searchButton);

        await waitFor(() => {
            expect(input).toHaveFocus();
        });
    });

    it('updates the input value when typing', async () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const input = screen.getByPlaceholderText('Search by accession');

        await userEvent.type(input, 'TEST123');

        expect((input as HTMLInputElement).value).toBe('TEST123');
    });

    it('navigates to the correct URL when submitting a valid accession', async () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const input = screen.getByPlaceholderText('Search by accession');
        const form = screen.getByRole('search', { name: 'Accession search' });

        await userEvent.type(input, 'ABC123.1');
        fireEvent.submit(form);

        expect(window.location.href).toBe(routes.sequenceEntryDetailsPage('ABC123.1'));
    });

    it('trims whitespace from the input before navigation', async () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const input = screen.getByPlaceholderText('Search by accession');
        const form = screen.getByRole('search', { name: 'Accession search' });

        await userEvent.type(input, '  ABC123.1  ');
        fireEvent.submit(form);

        expect(window.location.href).toBe(routes.sequenceEntryDetailsPage('ABC123.1'));
    });

    it('does not navigate when submitting an empty input', () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const form = screen.getByRole('search', { name: 'Accession search' });

        fireEvent.submit(form);

        expect(window.location.href).toBe('');
    });

    it('keeps the input open when submitting empty input', async () => {
        render(<AccessionSearchBox />);

        const searchButton = screen.getByRole('button');
        const input = screen.getByPlaceholderText('Search by accession');
        const form = screen.getByRole('search', { name: 'Accession search' });

        expect(input).toHaveClass('w-0', 'opacity-0');

        await userEvent.click(searchButton);
        expect(input).toHaveClass('opacity-100');

        fireEvent.submit(form);

        expect(input).toHaveClass('opacity-100');
    });

    it('calls onSubmitSuccess callback before navigation', async () => {
        const onSubmitSuccess = vi.fn();
        render(<AccessionSearchBox defaultOpen={true} onSubmitSuccess={onSubmitSuccess} />);

        const input = screen.getByPlaceholderText('Search by accession');
        const form = screen.getByRole('search', { name: 'Accession search' });

        await userEvent.type(input, 'ABC123');
        fireEvent.submit(form);

        expect(onSubmitSuccess).toHaveBeenCalled();
        expect(window.location.href).toBe(routes.sequenceEntryDetailsPage('ABC123'));
    });

    it('closes the input when Escape key is pressed', () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const input = screen.getByPlaceholderText('Search by accession');

        expect(input).toHaveClass('opacity-100');

        fireEvent.keyDown(input, { key: 'Escape' });

        expect(input).toHaveClass('w-0', 'opacity-0');
    });

    it('applies fullWidth class when fullWidth prop is true', () => {
        render(<AccessionSearchBox defaultOpen={true} fullWidth={true} />);

        const input = screen.getByPlaceholderText('Search by accession');

        expect(input).toHaveClass('w-full');
    });

    it('applies default width classes when fullWidth is false', () => {
        render(<AccessionSearchBox defaultOpen={true} fullWidth={false} />);

        const input = screen.getByPlaceholderText('Search by accession');

        expect(input).toHaveClass('w-36', 'lg:w-48');
    });

    it('applies custom className to the form element', () => {
        const customClass = 'custom-test-class';
        render(<AccessionSearchBox className={customClass} />);

        const form = screen.getByRole('search', { name: 'Accession search' });

        expect(form).toHaveClass(customClass);
    });

    it('has proper ARIA attributes', () => {
        render(<AccessionSearchBox defaultOpen={true} />);

        const form = screen.getByRole('search');
        const input = screen.getByPlaceholderText('Search by accession');
        const button = screen.getByRole('button');

        expect(form).toHaveAttribute('aria-label', 'Accession search');
        expect(input).toHaveAttribute('aria-label', 'Enter an accession or accession.version');
        expect(button).toHaveAttribute('aria-label');
    });

    it('changes button aria-label when open', async () => {
        render(<AccessionSearchBox />);

        const button = screen.getByRole('button');

        expect(button).toHaveAttribute('aria-label', 'Open accession search');

        await userEvent.click(button);

        expect(button).toHaveAttribute('aria-label', 'Search');
    });
});
