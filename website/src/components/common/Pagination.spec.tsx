import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './Pagination';

vi.mock('../../hooks/isClient', () => ({
    default: () => true,
}));

const renderedItems = () =>
    screen
        .getAllByRole('listitem')
        .map((item) => item.textContent)
        .filter((text) => text !== '');

describe('Pagination', () => {
    it('shows every page when there are few pages', () => {
        render(<Pagination count={5} page={1} onChange={vi.fn()} />);
        expect(renderedItems()).toEqual(['1', '2', '3', '4', '5']);
    });

    it.each([
        [1, ['1', '2', '3', '4', '5', '…', '20']],
        [10, ['1', '…', '9', '10', '11', '…', '20']],
        [20, ['1', '…', '16', '17', '18', '19', '20']],
    ])('shows the first, last and neighbouring pages when on page %i of 20', (page, expected) => {
        render(<Pagination count={20} page={page} onChange={vi.fn()} />);
        expect(renderedItems()).toEqual(expected);
    });

    it('calls onChange with the chosen page and disables previous on the first page', async () => {
        const onChange = vi.fn();
        render(<Pagination count={20} page={1} onChange={onChange} />);

        expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Go to page 1' })).toHaveAttribute('aria-current', 'page');

        await userEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));
        await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
        expect(onChange.mock.calls).toEqual([[3], [2]]);
    });
});
