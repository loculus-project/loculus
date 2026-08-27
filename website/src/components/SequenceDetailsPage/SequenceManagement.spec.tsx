import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { SequenceManagement } from './SequenceManagement';
import type { TableDataEntry } from './types';
import { testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import type { DataUseTermsHistoryEntry } from '../../types/backend';
import type { SequenceEntryHistory, SequenceEntryHistoryEntry } from '../../types/lapis';

const tableData: TableDataEntry[] = [
    {
        label: 'Group id',
        name: 'groupId',
        value: testGroups[0].groupId,
        header: 'Details',
        type: { kind: 'metadata', metadataType: 'int' },
    },
];

const ACCESSION = 'FOO';

const dataUseTermsHistory: DataUseTermsHistoryEntry[] = [
    { accession: ACCESSION, changeDate: '2024-01-01', userName: 'testUser', dataUseTerms: { type: 'OPEN' } },
];

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

function renderSequenceManagement(
    sequenceEntryHistory: SequenceEntryHistory,
    accessionVersion: string,
    isRevocation = false,
) {
    return render(
        <SequenceManagement
            tableData={tableData}
            organism={testOrganism}
            accessionVersion={accessionVersion}
            dataUseTermsHistory={dataUseTermsHistory}
            sequenceEntryHistory={sequenceEntryHistory}
            clientConfig={testConfig.public}
            myGroups={testGroups}
            accessToken={testAccessToken}
            isRevocation={isRevocation}
        />,
    );
}

describe('SequenceManagement', () => {
    describe('non-revocation versions', () => {
        test('shows revise and revoke buttons when the latest version is not a revocation', () => {
            renderSequenceManagement(revisedHistory, `${ACCESSION}.1`);
            expect(screen.getByRole('link', { name: 'Revise this sequence' })).toBeVisible();
            expect(screen.getByRole('button', { name: /revoke/i })).toBeVisible();
        });

        test('shows only the revise button when the latest version is a revocation', () => {
            renderSequenceManagement(revokedHistory, `${ACCESSION}.1`);
            expect(screen.getByRole('link', { name: 'Revise this sequence' })).toBeVisible();
            expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
        });
    });

    describe('revocation versions', () => {
        test('shows only the restore button on a revocation version that is the latest version', () => {
            renderSequenceManagement(revokedHistory, `${ACCESSION}.2`, true);
            expect(screen.getByRole('link', { name: 'Restore this sequence' })).toBeVisible();
            expect(screen.queryByRole('link', { name: 'Revise this sequence' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
        });

        test('renders nothing on a revocation version that is not the latest version', () => {
            const { container } = renderSequenceManagement(restoredHistory, `${ACCESSION}.2`, true);
            expect(container).toBeEmptyDOMElement();
        });
    });
});
