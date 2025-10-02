import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LadderGame from './LadderGame';

describe('LadderGame', () => {
    it('renders the draft mode toggle', () => {
        render(<LadderGame />);
        const toggle = screen.getByRole('checkbox', { name: /enable draft mode/i });
        expect(toggle).toBeInTheDocument();
        expect(toggle).not.toBeChecked();

        fireEvent.click(toggle);
        expect(toggle).toBeChecked();
    });
});
