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
        const client = LapisClient.create(
            'http://lapis.example',
            'http://backend.example/query/organism/current',
            'http://backend.example/query/organism/allVersions',
            schema,
        );
        const spy = vi
            .spyOn(client as unknown as { requestFull: LapisClient['getSequenceInsertions'] }, 'requestFull')
            .mockResolvedValue(ok({ data: [], info: { dataVersion: '' } } as InsertionsResponse));

        await client.getSequenceInsertions('LOC_123', 'nucleotide');

        expect(spy).toHaveBeenCalledWith(
            'http://backend.example/query/organism/allVersions/sequencesAligned/insertions',
            'post',
            {
                [schema.primaryKey]: 'LOC_123',
                orderBy: [
                    { field: 'sequenceName', type: 'ascending' },
                    { field: 'position', type: 'ascending' },
                ],
            },
            expect.anything(),
        );
    });
});
