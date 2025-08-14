import { ok } from 'neverthrow';
import { describe, expect, test, vi } from 'vitest';

import { LapisClient } from './lapisClient.ts';
import type { Schema } from '../types/config.ts';
import type { InsertionsResponse } from '../types/lapis.ts';

describe('LapisClient', () => {
    test('getSequenceInsertions should order by sequence and position', async () => {
        const schema: Schema = {
            organismName: 'organism',
            metadata: [],
            tableColumns: [],
            defaultOrderBy: 'id',
            defaultOrder: 'ascending',
            primaryKey: 'pk',
            inputFields: [],
            submissionDataTypes: { consensusSequences: false },
        };
        const client = LapisClient.create('http://lapis.example', schema);
        const spy = vi
            .spyOn(client, 'call')
            .mockResolvedValue(ok({ data: [], info: { dataVersion: '' } } as InsertionsResponse));

        await client.getSequenceInsertions('AV1', 'nucleotide');

        expect(spy).toHaveBeenCalledWith('nucleotideInsertions', {
            [schema.primaryKey]: 'AV1',
            orderBy: [
                { field: 'sequenceName', type: 'ascending' },
                { field: 'position', type: 'ascending' },
            ],
        });
    });
});
