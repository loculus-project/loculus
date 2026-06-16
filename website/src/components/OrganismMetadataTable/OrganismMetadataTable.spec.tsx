import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AllowedValuesList } from './OrganismMetadataTable';

const options = [{ name: 'Germany' }, { name: 'France' }, { name: 'United States' }];

describe('AllowedValuesList', () => {
    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: vi.fn().mockResolvedValue(undefined) },
            configurable: true,
        });
    });

    it('shows all options when query is empty', () => {
        render(<AllowedValuesList options={options} />);
        expect(screen.getByText('Germany')).toBeInTheDocument();
        expect(screen.getByText('France')).toBeInTheDocument();
        expect(screen.getByText('United States')).toBeInTheDocument();
    });

    it('filters options by query', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.type(screen.getByRole('textbox'), 'ger');
        expect(screen.getByText('Germany')).toBeInTheDocument();
        expect(screen.queryByText('France')).not.toBeInTheDocument();
    });

    it('trims leading and trailing whitespace from query', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.type(screen.getByRole('textbox'), '  Germany  ');
        expect(screen.getByText('Germany')).toBeInTheDocument();
        expect(screen.queryByText('France')).not.toBeInTheDocument();
    });

    it('shows all options when query is only whitespace', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.type(screen.getByRole('textbox'), '   ');
        expect(screen.getByText('Germany')).toBeInTheDocument();
        expect(screen.getByText('France')).toBeInTheDocument();
        expect(screen.getByText('United States')).toBeInTheDocument();
    });

    it('copies all options to clipboard when no query is active', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Germany\nFrance\nUnited States');
    });

    it('copies only the filtered options when a query is active', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.type(screen.getByRole('textbox'), 'ger');
        await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Germany');
    });

    it('copies filtered options after trimming whitespace from query', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.type(screen.getByRole('textbox'), '  France  ');
        await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('France');
    });

    it('shows "Copied!" feedback after clicking copy', async () => {
        render(<AllowedValuesList options={options} />);
        await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
        expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    });
});
