import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { SequenceManagement } from './SequenceManagement';
import type { TableDataEntry } from './types';
import { testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import type { DataUseTermsHistoryEntry, Group } from '../../types/backend';
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

function renderSequenceManagement({
    accessionVersion,
    sequenceEntryHistory,
    accessToken,
    myGroups = testGroups,
    isRevocation = false,
}: {
    accessionVersion: string;
    sequenceEntryHistory: SequenceEntryHistory;
    accessToken: string | undefined;
    myGroups?: Group[];
    isRevocation?: boolean;
}) {
    return render(
        <SequenceManagement
            tableData={tableData}
            organism={testOrganism}
            accessionVersion={accessionVersion}
            dataUseTermsHistory={dataUseTermsHistory}
            sequenceEntryHistory={sequenceEntryHistory}
            clientConfig={testConfig.public}
            myGroups={myGroups}
            accessToken={accessToken}
            isRevocation={isRevocation}
        />,
    );
}

describe('SequenceManagement', () => {
    test('shows revise and revoke buttons on non-revocations when the latest version is non-revocation', () => {
        renderSequenceManagement({
            accessionVersion: `${ACCESSION}.1`,
            sequenceEntryHistory: revisedHistory,
            accessToken: testAccessToken,
        });
        expect(screen.getByRole('link', { name: 'Revise this sequence' })).toBeVisible();
        expect(screen.getByRole('button', { name: /revoke/i })).toBeVisible();
    });

    test('shows only the revise button on non-revocations when the latest version is a revocation', () => {
        renderSequenceManagement({
            accessionVersion: `${ACCESSION}.1`,
            sequenceEntryHistory: revokedHistory,
            accessToken: testAccessToken,
        });
        expect(screen.getByRole('link', { name: 'Revise this sequence' })).toBeVisible();
        expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
    });

    test('shows only the restore button on revocation versions that are the latest version', () => {
        renderSequenceManagement({
            accessionVersion: `${ACCESSION}.2`,
            sequenceEntryHistory: revokedHistory,
            accessToken: testAccessToken,
            isRevocation: true,
        });
        expect(screen.getByRole('link', { name: 'Restore this sequence' })).toBeVisible();
        expect(screen.queryByRole('link', { name: 'Revise this sequence' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
    });

    test('renders nothing on revocation versions that are not the latest version', () => {
        const { container } = renderSequenceManagement({
            accessionVersion: `${ACCESSION}.2`,
            sequenceEntryHistory: restoredHistory,
            accessToken: testAccessToken,
            isRevocation: true,
        });
        expect(container).toBeEmptyDOMElement();
    });

    test('renders nothing when the entry does not belong to one of the users groups', () => {
        const { container } = renderSequenceManagement({
            accessionVersion: `${ACCESSION}.2`,
            sequenceEntryHistory: revisedHistory,
            myGroups: [],
            accessToken: testAccessToken,
        });
        expect(container).toBeEmptyDOMElement();
    });

    test('renders nothing when there is no access token', () => {
        const { container } = renderSequenceManagement({
            accessionVersion: `${ACCESSION}.2`,
            sequenceEntryHistory: revisedHistory,
            accessToken: undefined,
        });
        expect(container).toBeEmptyDOMElement();
    });
});
