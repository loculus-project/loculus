import { describe, expect, test } from 'vitest';

import { getMetadataTableData } from './getMetadataTableData';
import type { Metadata } from '../../types/config';
import { compareVersionData } from '../VersionDiff/compareVersions';

describe('metadata comparison rows', () => {
    test('preserves zero, false, empty strings and configured displays; omits absent and hidden fields', () => {
        const fields: Metadata[] = [
            { name: 'count', type: 'int' },
            { name: 'flag', type: 'boolean' },
            { name: 'empty', type: 'string' },
            { name: 'missing', type: 'string' },
            { name: 'null', type: 'string' },
            { name: 'hidden', type: 'string', hideOnSequenceDetailsPage: true },
            {
                name: 'insdc',
                type: 'string',
                displayName: 'INSDC accession',
                header: 'INSDC',
                orderOnDetailsPage: 2,
                customDisplay: { type: 'link', url: 'https://example.org/__value__' },
            },
        ];
        const rows = getMetadataTableData(fields, {
            count: 0,
            flag: false,
            empty: '',
            null: null,
            hidden: 'secret',
            insdc: 'ABC.1',
        });
        expect(rows.map(({ name, value }) => [name, value])).toEqual([
            ['count', 0],
            ['flag', false],
            ['empty', ''],
            ['insdc', 'ABC.1'],
        ]);
        expect(rows[3]).toMatchObject({
            label: 'INSDC accession',
            header: 'INSDC',
            orderOnDetailsPage: 2,
            customDisplay: fields[6].customDisplay,
        });
    });

    test('detects additions, removals and changed values while keeping unchanged fields separate', () => {
        const fields: Metadata[] = ['added', 'removed', 'changed', 'same'].map((name) => ({ name, type: 'string' }));
        const result = compareVersionData(
            {
                tableData: getMetadataTableData(fields, {
                    added: null,
                    removed: 'old',
                    changed: 'before',
                    same: 'same',
                }),
            },
            {
                tableData: getMetadataTableData(fields, {
                    added: 'new',
                    removed: null,
                    changed: 'after',
                    same: 'same',
                }),
            },
        );
        expect(result.changedFields.map(({ name }) => name)).toEqual(['removed', 'changed', 'added']);
        expect(result.changedFields[0].entry2).toBeNull();
        expect(result.changedFields[2].entry1).toBeNull();
        expect(result.unchangedFields.map(({ name }) => name)).toEqual(['same']);
    });
});
