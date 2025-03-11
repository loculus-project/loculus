import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { SequenceEntryHistoryMenu } from './SequenceEntryHistoryMenu';
import type { SequenceEntryHistory, SequenceEntryHistoryEntry } from '../../types/lapis';

describe('SequenceEntryHistoryMenu', () => {
    const baseEntry: SequenceEntryHistoryEntry = {
        submittedAtTimestamp: '',
        accession: '',
        version: 0,
        accessionVersion: '',
        versionStatus: 'REVOKED',
        isRevocation: false,
    };

    const historyRevised: SequenceEntryHistory = [
        { ...baseEntry, accessionVersion: 'FOO.1', versionStatus: 'REVISED', isRevocation: false },
        { ...baseEntry, accessionVersion: 'FOO.2', versionStatus: 'LATEST_VERSION', isRevocation: false },
    ];

    test('latest version is labeled correctly', async () => {
        render(<SequenceEntryHistoryMenu sequenceEntryHistory={historyRevised} accessionVersion='FOO.2' />);
        const button = screen.getByText('All versions');
        await userEvent.hover(button);

        expect(screen.getByRole('link', { name: 'FOO.1 Previous version' })).toBeVisible();
        expect(screen.getByRole('link', { name: 'FOO.2 Latest version' })).toBeVisible();
    });

    const historyRevoke: SequenceEntryHistory = [
        { ...baseEntry, accessionVersion: 'BAR.1', versionStatus: 'REVISED', isRevocation: false, version: 1 },
        { ...baseEntry, accessionVersion: 'BAR.2', versionStatus: 'LATEST_VERSION', isRevocation: true, version: 2 }, 
    ];

    test('revoked version is labeled correctly', async () => {
        render(<SequenceEntryHistoryMenu sequenceEntryHistory={historyRevoke} accessionVersion='BAR.2' />);
        const button = screen.getByText('Version 2');
        await userEvent.hover(button);

        expect(screen.getByRole('link', { name: 'BAR.1 Previous version' })).toBeVisible();
        expect(screen.getByRole('link', { name: 'BAR.2 Sequence revoked' })).toBeVisible();
    });
});
