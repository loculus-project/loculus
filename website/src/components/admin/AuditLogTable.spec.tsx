import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AuditLogTable } from './AuditLogTable';
import type { AuditEntry } from '../../types/loculusConfig';

const entries: AuditEntry[] = [
    {
        id: 1,
        occurredAt: '2026-05-28T01:00:00Z',
        actor: 'alice',
        scope: 'instance',
        organismKey: null,
        action: 'publish',
        details: { summary: 'Instance published v3' },
        resultVersion: 3,
    },
    {
        id: 2,
        occurredAt: '2026-05-28T01:01:00Z',
        actor: 'bob',
        scope: 'organism',
        organismKey: 'lassa-virus',
        action: 'op_append',
        details: { summary: "Set display name to 'Lassa virus'" },
        resultVersion: null,
    },
    {
        id: 3,
        occurredAt: '2026-05-28T01:02:00Z',
        actor: 'carol',
        scope: 'organism',
        organismKey: 'ebola-virus',
        action: 'publish',
        details: { summary: 'Ebola published v2' },
        resultVersion: 2,
    },
];

describe('AuditLogTable', () => {
    it('shows all entries by default', () => {
        render(<AuditLogTable entries={entries} organismKeys={['lassa-virus', 'ebola-virus']} />);
        expect(screen.getByText(/Showing 3 of 3 entries/)).toBeInTheDocument();
        expect(screen.getByText('Instance published v3')).toBeInTheDocument();
        expect(screen.getByText("Set display name to 'Lassa virus'")).toBeInTheDocument();
        expect(screen.getByText('Ebola published v2')).toBeInTheDocument();
    });

    it('filters to instance-only', async () => {
        const user = userEvent.setup();
        render(<AuditLogTable entries={entries} organismKeys={['lassa-virus', 'ebola-virus']} />);

        await user.selectOptions(screen.getByRole('combobox'), 'instance');

        expect(screen.getByText(/Showing 1 of 3 entries/)).toBeInTheDocument();
        expect(screen.getByText('Instance published v3')).toBeInTheDocument();
        expect(screen.queryByText("Set display name to 'Lassa virus'")).not.toBeInTheDocument();
        expect(screen.queryByText('Ebola published v2')).not.toBeInTheDocument();
    });

    it('filters to a specific organism', async () => {
        const user = userEvent.setup();
        render(<AuditLogTable entries={entries} organismKeys={['lassa-virus', 'ebola-virus']} />);

        await user.selectOptions(screen.getByRole('combobox'), 'lassa-virus');

        expect(screen.getByText(/Showing 1 of 3 entries/)).toBeInTheDocument();
        expect(screen.getByText("Set display name to 'Lassa virus'")).toBeInTheDocument();
        expect(screen.queryByText('Instance published v3')).not.toBeInTheDocument();
        expect(screen.queryByText('Ebola published v2')).not.toBeInTheDocument();
    });

    it('includes organisms that only appear in entries (e.g. removed/renamed)', () => {
        render(<AuditLogTable entries={entries} organismKeys={[]} />);
        const select = screen.getByRole('combobox');
        // Both organisms referenced in entries are options.
        expect(within(select).getByRole('option', { name: 'lassa-virus' })).toBeInTheDocument();
        expect(within(select).getByRole('option', { name: 'ebola-virus' })).toBeInTheDocument();
    });
});
