import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import SequencesBanner from './SequencesBanner';
import type { SequenceEntryHistory, SequenceEntryHistoryEntry } from '../../types/lapis';

const ACCESSION = 'FOO';

const NOT_LATEST_BANNER = 'This is not the latest version of this sequence entry.';
const REVOCATION_VERSION_BANNER = /This is a revocation version\./;
const REVOKED_BANNER = 'This sequence entry has been revoked!';

const baseEntry: SequenceEntryHistoryEntry = {
    submittedAtTimestamp: '',
    accession: ACCESSION,
    version: 1,
    accessionVersion: `${ACCESSION}.1`,
    versionStatus: 'LATEST_VERSION',
    isRevocation: false,
};

const revisedHistory: SequenceEntryHistory = [
    { ...baseEntry, accessionVersion: `${ACCESSION}.1`, version: 1, versionStatus: 'REVISED', isRevocation: false },
    {
        ...baseEntry,
        accessionVersion: `${ACCESSION}.2`,
        version: 2,
        versionStatus: 'LATEST_VERSION',
        isRevocation: false,
    },
];

const revokedHistory: SequenceEntryHistory = [
    { ...baseEntry, accessionVersion: `${ACCESSION}.1`, version: 1, versionStatus: 'REVOKED', isRevocation: false },
    {
        ...baseEntry,
        accessionVersion: `${ACCESSION}.2`,
        version: 2,
        versionStatus: 'LATEST_VERSION',
        isRevocation: true,
    },
];

const restoredHistory: SequenceEntryHistory = [
    { ...baseEntry, accessionVersion: `${ACCESSION}.1`, version: 1, versionStatus: 'REVOKED', isRevocation: false },
    { ...baseEntry, accessionVersion: `${ACCESSION}.2`, version: 2, versionStatus: 'REVISED', isRevocation: true },
    {
        ...baseEntry,
        accessionVersion: `${ACCESSION}.3`,
        version: 3,
        versionStatus: 'LATEST_VERSION',
        isRevocation: false,
    },
];

function renderSequencesBanner(sequenceEntryHistory: SequenceEntryHistory, accessionVersion: string) {
    return render(<SequencesBanner sequenceEntryHistory={sequenceEntryHistory} accessionVersion={accessionVersion} />);
}

describe('SequencesBanner', () => {
    test('shows no banners on non-revocations that are the latest version', () => {
        renderSequencesBanner(revisedHistory, `${ACCESSION}.2`);
        expect(screen.queryByText(NOT_LATEST_BANNER)).not.toBeInTheDocument();
        expect(screen.queryByText(REVOKED_BANNER)).not.toBeInTheDocument();
    });

    test('shows only the not latest version banner on non-revocations when the latest version is non-revocation', () => {
        renderSequencesBanner(revisedHistory, `${ACCESSION}.1`);
        expect(screen.getByText(NOT_LATEST_BANNER)).toBeVisible();
        expect(screen.getByRole('link', { name: `${ACCESSION}.2` })).toBeVisible();
        expect(screen.queryByText(REVOKED_BANNER)).not.toBeInTheDocument();
    });

    test('shows the not latest version and revoked banners on non-revocations when the latest version is a revocation', () => {
        renderSequencesBanner(revokedHistory, `${ACCESSION}.1`);
        expect(screen.getByText(NOT_LATEST_BANNER)).toBeVisible();
        expect(screen.getByText(REVOKED_BANNER)).toBeVisible();
    });

    test('shows only the not latest version banner on non-revocations when a later version supersedes the revocation', () => {
        renderSequencesBanner(restoredHistory, `${ACCESSION}.1`);
        expect(screen.getByText(NOT_LATEST_BANNER)).toBeVisible();
        expect(screen.queryByText(REVOKED_BANNER)).not.toBeInTheDocument();
    });

    test('shows only the revocation version banner on revocation versions that are the latest version', () => {
        renderSequencesBanner(revokedHistory, `${ACCESSION}.2`);
        expect(screen.getByText(REVOCATION_VERSION_BANNER)).toBeVisible();
        expect(screen.queryByText(NOT_LATEST_BANNER)).not.toBeInTheDocument();
        expect(screen.queryByText(REVOKED_BANNER)).not.toBeInTheDocument();
    });

    test('shows the not latest version and revocation version banners on revocation versions that are not the latest version', () => {
        renderSequencesBanner(restoredHistory, `${ACCESSION}.2`);
        expect(screen.getByText(NOT_LATEST_BANNER)).toBeVisible();
        expect(screen.getByText(REVOCATION_VERSION_BANNER)).toBeVisible();
        expect(screen.queryByText(REVOKED_BANNER)).not.toBeInTheDocument();
    });
});
