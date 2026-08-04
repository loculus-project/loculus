import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { buttonClasses } from './buttonStyles';

// Both Button and DisabledUntilHydrated read this hook; mocking it lets us drive
// the pre-/post-hydration states deterministically.
let mockIsClient = true;
vi.mock('../../hooks/isClient', () => ({
    default: () => mockIsClient,
}));

describe('buttonClasses', () => {
    it('applies the variant look when not disabled', () => {
        const cls = buttonClasses({ variant: 'primary' });
        expect(cls).toContain('bg-[var(--color-main)]');
        expect(cls).not.toContain('bg-base-content/10');
    });

    it('replaces the variant look with the disabled look when disabled', () => {
        const cls = buttonClasses({ variant: 'primary', disabled: true });
        expect(cls).toContain('bg-base-content/10');
        expect(cls).toContain('pointer-events-none');
        expect(cls).not.toContain('bg-[var(--color-main)]');
    });
});

describe('Button hydration state', () => {
    afterEach(() => {
        mockIsClient = true;
    });

    it('shows a loading cursor and keeps the enabled look while waiting for hydration', () => {
        mockIsClient = false;
        render(<Button variant='primary'>Go</Button>);
        const btn = screen.getByRole('button', { name: 'Go' });
        expect(btn).toBeDisabled();
        expect(btn.className).toContain('cursor-wait');
        expect(btn.className).toContain('bg-[var(--color-main)]');
        expect(btn.className).not.toContain('bg-base-content/10');
    });

    it('shows the disabled look (not a loading cursor) when genuinely disabled', () => {
        mockIsClient = false; // a real disable wins even before hydration
        render(
            <Button variant='primary' alsoDisabledIf>
                Go
            </Button>,
        );
        const btn = screen.getByRole('button', { name: 'Go' });
        expect(btn).toBeDisabled();
        expect(btn.className).toContain('bg-base-content/10');
        expect(btn.className).not.toContain('cursor-wait');
    });

    it('shows the normal enabled look once hydrated', () => {
        mockIsClient = true;
        render(<Button variant='primary'>Go</Button>);
        const btn = screen.getByRole('button', { name: 'Go' });
        expect(btn).toBeEnabled();
        expect(btn.className).toContain('bg-[var(--color-main)]');
        expect(btn.className).not.toContain('cursor-wait');
        expect(btn.className).not.toContain('bg-base-content/10');
    });
});
