import { describe, expect, test } from 'vitest';

import { getDataTableData } from './getDataTableData.ts';
import { type TableDataEntry } from './types.ts';

describe('getDataTableData', () => {
    test('should group entries according to header', () => {
        const data = getDataTableData(testTableDataEntries);
        expect(data.table.length).toStrictEqual(2);
        expect(data.table[0].header).toStrictEqual('Header 1');
        expect(data.table[0].rows.map((r) => r.name)).toStrictEqual(['metadata_field_1', 'metadata_field_2']);
        expect(data.table[1].header).toStrictEqual('Header 2');
        expect(data.table[1].rows.map((r) => r.name)).toStrictEqual(['metadata_field_3']);
    });

    test('should move authors to topmatter', () => {
        const data = getDataTableData(testTableDataEntries);
        expect(data.topmatter.authors).toStrictEqual(['author 1', 'author 2', 'author 3']);
        expect(
            data.table
                .flatMap((x) => x.rows)
                .find((x) => x.type.kind === 'metadata' && x.type.metadataType === 'authors'),
        ).toBeUndefined();
    });
});

const testTableDataEntries: TableDataEntry[] = [
    {
        label: 'Metadata Field 1',
        name: 'metadata_field_1',
        value: 'value1',
        header: 'Header 1',
        type: { kind: 'metadata', metadataType: 'string' },
    },
    {
        label: 'Metadata Field 2',
        name: 'metadata_field_2',
        value: 'value2',
        header: 'Header 1',
        type: { kind: 'metadata', metadataType: 'timestamp' },
    },
    {
        label: 'Metadata Field 3',
        name: 'metadata_field_3',
        value: 'value3',
        header: 'Header 2',
        type: { kind: 'metadata', metadataType: 'int' },
    },
    {
        label: 'Authors',
        name: 'authors',
        value: 'author 1; author 2; author 3',
        header: 'Header 2',
        type: { kind: 'metadata', metadataType: 'authors' },
    },
];
