import { describe, expect, test } from 'vitest';

import { type TableDataEntry, getTableData } from './getTableData.ts';
import { getDataTableData } from './getDataTableData.ts';


describe('getDataTableData', () => {
    test('should move authors to topmatter', async () => {
        const data = getDataTableData(testTableDataEntries);
        expect(data.topmatter.authors).toStrictEqual(
            ['author 1', 'author 2', 'author 3']
        );
        expect(
            data.table.flatMap((x) => x.rows).find(x => x.type.name === 'metadata' && x.type.type === 'authors')
        ).toBeUndefined();
    });
});

const testTableDataEntries: TableDataEntry[] = [
    {
        label: 'Metadata Field 1',
        name: 'metadata_field_1',
        value: 'value1',
        header: 'Header 1',
        type: { name: 'metadata', type: 'string' },
    },
    {
        label: 'Metadata Field 2',
        name: 'metadata_field_2',
        value: 'value2',
        header: 'Header 1',
        type: { name: 'metadata', type: 'timestamp' },
    },
    {
        label: 'Metadata Field 3',
        name: 'metadata_field_3',
        value: 'value3',
        header: 'Header 2',
        type: { name: 'metadata', type: 'int' },
    },
    {
        label: 'Authors',
        name: 'authors',
        value: 'author 1, author 2, author 3',
        header: 'Header 1',
        type: { name: 'metadata', type: 'authors' },
    },
]
