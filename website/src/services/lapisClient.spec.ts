import axios from 'axios';
import { describe, expect, test, vi } from 'vitest';

import { LapisClient } from './lapisClient.ts';
import type { Schema } from '../types/config.ts';

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
        const spy = vi.spyOn(axios, 'request').mockResolvedValue({ data: { data: [], info: { dataVersion: '' } } });

        const result = await client.getSequenceInsertions('LOC_123', 'nucleotide');

        expect(result.isOk()).toBe(true);
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: 'http://lapis.example',
                url: '/sample/nucleotideInsertions',
                method: 'post',
                data: {
                    [schema.primaryKey]: 'LOC_123',
                    orderBy: [
                        { field: 'sequenceName', type: 'ascending' },
                        { field: 'position', type: 'ascending' },
                    ],
                },
            }),
        );
    });
});
