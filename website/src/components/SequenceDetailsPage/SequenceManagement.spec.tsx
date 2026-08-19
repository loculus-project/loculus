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

const dataUseTermsHistory: DataUseTermsHistoryEntry[] = [
    { accession: 'FOO', changeDate: '2024-01-01', userName: 'testUser', dataUseTerms: { type: 'OPEN' } },
];

const baseEntry: SequenceEntryHistoryEntry = {
    submittedAtTimestamp: '',
    accession: 'FOO',
    version: 1,
    accessionVersion: 'FOO.1',
    versionStatus: 'LATEST_VERSION',
    isRevocation: false,
};

const revokedHistory: SequenceEntryHistory = [
    { ...baseEntry, accessionVersion: 'FOO.1', version: 1, versionStatus: 'REVOKED', isRevocation: false },
    { ...baseEntry, accessionVersion: 'FOO.2', version: 2, versionStatus: 'LATEST_VERSION', isRevocation: true },
];

const revisedHistory: SequenceEntryHistory = [
    { ...baseEntry, accessionVersion: 'FOO.1', version: 1, versionStatus: 'REVISED', isRevocation: false },
    { ...baseEntry, accessionVersion: 'FOO.2', version: 2, versionStatus: 'LATEST_VERSION', isRevocation: false },
];

function renderSequenceManagement(sequenceEntryHistory: SequenceEntryHistory) {
    return render(
        <SequenceManagement
            tableData={tableData}
            organism={testOrganism}
            accessionVersion='FOO.1'
            dataUseTermsHistory={dataUseTermsHistory}
            sequenceEntryHistory={sequenceEntryHistory}
            clientConfig={testConfig.public}
            myGroups={testGroups}
            accessToken={testAccessToken}
            isRevocation={false}
        />,
    );
}

describe('SequenceManagement', () => {
    test('hides the revoke button when the latest version is already a revocation', () => {
        renderSequenceManagement(revokedHistory);

        expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument();
    });

    test('still offers a revision when the latest version is a revocation', () => {
        renderSequenceManagement(revokedHistory);

        expect(screen.getByRole('link', { name: 'Revise this sequence' })).toBeVisible();
    });

    test('shows the revoke button when the latest version is not a revocation', () => {
        renderSequenceManagement(revisedHistory);

        expect(screen.getByRole('button', { name: /revoke/i })).toBeVisible();
    });
});
