import { describe, expect, test } from 'vitest';

import { getDataTableData } from './getDataTableData.ts';
import { type TableDataEntry } from './types.ts';
import type { Header } from '../../types/config.ts';

const headers: Header[] = [
    { name: 'Header 1', order: 1 },
    { name: 'Header 2', order: 2 },
];

describe('getDataTableData', () => {
    test('should group entries according to header', () => {
        const data = getDataTableData(testTableDataEntries, headers);
        expect(data.table.length).toStrictEqual(2);
        expect(data.table[0].header).toStrictEqual('Header 1');
        expect(data.table[0].rows.map((r) => r.name)).toStrictEqual(['metadata_field_1', 'metadata_field_2']);
        expect(data.table[1].header).toStrictEqual('Header 2');
        expect(data.table[1].rows.map((r) => r.name)).toStrictEqual(['metadata_field_3']);
    });

    test('should move authors to topmatter', () => {
        const data = getDataTableData(testTableDataEntries, headers);
        expect(data.topmatter.authors).toStrictEqual(['First1 Last1', 'First2 Last2', 'First3 Last3']);
        expect(
            data.table
                .flatMap((x) => x.rows)
                .find((x) => x.type.kind === 'metadata' && x.type.metadataType === 'authors'),
        ).toBeUndefined();
    });

    test('should order headers and rows by orderOnDetailsPage and headerOrder', () => {
        const entries: TableDataEntry[] = [
            {
                label: 'A1',
                name: 'a1',
                value: 'v1',
                header: 'Header 1',
                type: { kind: 'metadata', metadataType: 'string' },
                orderOnDetailsPage: 20,
            },
            {
                label: 'B1',
                name: 'b1',
                value: 'v2',
                header: 'Header 2',
                type: { kind: 'metadata', metadataType: 'string' },
                orderOnDetailsPage: 5,
            },
            {
                label: 'A2',
                name: 'a2',
                value: 'v3',
                header: 'Header 1',
                type: { kind: 'metadata', metadataType: 'string' },
                orderOnDetailsPage: 10,
            },
        ];

        const data = getDataTableData(entries, headers);

        expect(data.table.map((t) => t.header)).toStrictEqual(['Header 1', 'Header 2']);
        expect(data.table[0].rows.map((r) => r.name)).toStrictEqual(['a2', 'a1']);
    });
});

const testTableDataEntries: TableDataEntry[] = [
    {
        label: 'Metadata Field 1',
        name: 'metadata_field_1',
        value: 'value1',
        header: 'Header 1',
        type: { kind: 'metadata', metadataType: 'string' },
        orderOnDetailsPage: 1,
    },
    {
        label: 'Metadata Field 2',
        name: 'metadata_field_2',
        value: 'value2',
        header: 'Header 1',
        type: { kind: 'metadata', metadataType: 'timestamp' },
        orderOnDetailsPage: 3,
    },
    {
        label: 'Metadata Field 3',
        name: 'metadata_field_3',
        value: 'value3',
        header: 'Header 2',
        type: { kind: 'metadata', metadataType: 'int' },
        orderOnDetailsPage: 2,
    },
    {
        label: 'Authors',
        name: 'authors',
        value: 'Last1, First1; Last2, First2; Last3, First3',
        header: 'Header 2',
        type: { kind: 'metadata', metadataType: 'authors' },
        orderOnDetailsPage: 4,
    },
];
