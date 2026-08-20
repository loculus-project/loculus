import { describe, expect, test } from 'vitest';

import { filterToRevocationRelevantFields } from './revocationEntryFields';
import { type TableDataEntry } from './types';

const entry = (name: string, type: TableDataEntry['type'] = { kind: 'metadata', metadataType: 'string' }) => ({
    label: name,
    name,
    value: 'some value',
    header: '',
    type,
});

describe('filterToRevocationRelevantFields', () => {
    test('should keep the fields describing the revocation itself', () => {
        const tableData = [entry('accessionVersion'), entry('isRevocation'), entry('versionComment')];

        expect(filterToRevocationRelevantFields(tableData).map((e) => e.name)).toStrictEqual([
            'accessionVersion',
            'isRevocation',
            'versionComment',
        ]);
    });

    test('should drop metadata inherited from the revoked version and mutation entries', () => {
        const tableData = [
            entry('accessionVersion'),
            entry('country'),
            entry('sampleCollectionDate'),
            entry('nucleotideSubstitutions', { kind: 'mutation' }),
            entry('aminoAcidInsertions', { kind: 'mutation' }),
        ];

        expect(filterToRevocationRelevantFields(tableData).map((e) => e.name)).toStrictEqual(['accessionVersion']);
    });
});
