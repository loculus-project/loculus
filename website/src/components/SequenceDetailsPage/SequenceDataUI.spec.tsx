import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { SequenceDataUI } from './SequenceDataUI';
import type { SequenceData, TableDataEntry } from './types';
import { testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import type { DataUseTermsHistoryEntry } from '../../types/backend';
import type { Schema, SequenceFlaggingConfig } from '../../types/config';
import type { SequenceEntryHistory, SequenceEntryHistoryEntry } from '../../types/lapis';
import type { ReferenceGenomesInfo } from '../../types/referencesGenomes';
import type { SequenceCitation } from '../../types/seqSetCitation';

const ACCESSION = 'FOO';
const COLLECTION_COUNTRY = 'Germany';
const VERSION_COMMENT = 'Test version comment';

const tableData: TableDataEntry[] = [
    {
        label: 'Group id',
        name: 'groupId',
        value: testGroups[0].groupId,
        header: 'Details',
        type: { kind: 'metadata', metadataType: 'int' },
    },
    {
        label: 'Version comment',
        name: 'versionComment',
        value: VERSION_COMMENT,
        header: 'Details',
        type: { kind: 'metadata', metadataType: 'string' },
    },
    {
        label: 'Collection country',
        name: 'collectionCountry',
        value: COLLECTION_COUNTRY,
        header: 'Details',
        type: { kind: 'metadata', metadataType: 'string' },
    },
];

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

const latestHistory: SequenceEntryHistory = [baseEntry];

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

const sequenceData: SequenceData = {
    tableData,
    sequenceEntryHistory: latestHistory,
    dataUseTermsHistory,
    isRevocation: false,
};

const revocationSequenceData: SequenceData = {
    tableData,
    sequenceEntryHistory: revokedHistory,
    dataUseTermsHistory,
    isRevocation: true,
};

const schema: Schema = {
    organismName: '',
    metadata: [],
    tableColumns: [],
    primaryKey: 'accessionVersion',
    defaultOrderBy: 'accessionVersion',
    defaultOrder: 'ascending',
    inputFields: [],
    metadataTemplate: [],
    submissionDataTypes: { consensusSequences: true },
};

const referenceGenomesInfo: ReferenceGenomesInfo = {
    segmentReferenceGenomes: {
        main: { refA: { lapisName: 'main', insdcAccessionFull: null, genes: [], displayName: 'Reference A' } },
    },
    segmentDisplayNames: { main: 'Main Segment' },
    isMultiSegmented: false,
    useLapisMultiSegmentedEndpoint: false,
};

const sequenceFlaggingConfig: SequenceFlaggingConfig = {
    github: { organization: 'loculus-project', repository: 'loculus' },
};

const sequenceCitations: SequenceCitation[] = [
    {
        source: { sourceDOI: '10.1234/foo', title: 'A study', year: 2024, contributors: [] },
        seqSets: [{ seqSetAccessionVersion: 'SS_1.1', sequenceAccession: `${ACCESSION}.1` }],
    },
];

function renderSequenceDataUI(sequenceDataToRender: SequenceData, accessionVersion: string) {
    return render(
        <SequenceDataUI
            sequenceData={sequenceDataToRender}
            organism={testOrganism}
            accessionVersion={accessionVersion}
            schema={schema}
            clientConfig={testConfig.public}
            myGroups={testGroups}
            accessToken={testAccessToken}
            sequenceFlaggingConfig={sequenceFlaggingConfig}
            referenceGenomesInfo={referenceGenomesInfo}
            sequenceCitations={sequenceCitations}
        />,
    );
}

describe('SequenceDataUI', () => {
    test('shows all metadata fields on non-revocations', () => {
        renderSequenceDataUI(sequenceData, `${ACCESSION}.1`);
        expect(screen.getByText(COLLECTION_COUNTRY)).toBeVisible();
        expect(screen.getByText(VERSION_COMMENT)).toBeVisible();
    });

    test('shows only revocation version fields on revocation versions', () => {
        renderSequenceDataUI(revocationSequenceData, `${ACCESSION}.2`);
        expect(screen.getByText(VERSION_COMMENT)).toBeVisible();
        expect(screen.queryByText(COLLECTION_COUNTRY)).not.toBeInTheDocument();
    });

    test('shows the sequences on non-revocations', () => {
        renderSequenceDataUI(sequenceData, `${ACCESSION}.1`);
        expect(screen.getByRole('button', { name: 'Load sequences' })).toBeVisible();
    });

    test('shows no sequences on revocation versions', () => {
        renderSequenceDataUI(revocationSequenceData, `${ACCESSION}.2`);
        expect(screen.queryByRole('button', { name: 'Load sequences' })).not.toBeInTheDocument();
    });

    test('shows the sequence citations on non-revocations', () => {
        renderSequenceDataUI(sequenceData, `${ACCESSION}.1`);
        expect(screen.getByText('Cited in')).toBeVisible();
    });

    test('shows no sequence citations on revocation versions', () => {
        renderSequenceDataUI(revocationSequenceData, `${ACCESSION}.2`);
        expect(screen.queryByText('Cited in')).not.toBeInTheDocument();
    });

    test('shows the issue reporting link on non-revocations', () => {
        renderSequenceDataUI(sequenceData, `${ACCESSION}.1`);
        expect(screen.getByRole('link', { name: 'Create GitHub issue' })).toBeVisible();
    });

    test('shows no issue reporting link on revocation versions', () => {
        renderSequenceDataUI(revocationSequenceData, `${ACCESSION}.2`);
        expect(screen.queryByRole('link', { name: 'Create GitHub issue' })).not.toBeInTheDocument();
    });
});
