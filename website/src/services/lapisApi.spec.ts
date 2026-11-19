import axios from 'axios';
import { describe, expect, test, vi } from 'vitest';

import { lapisApi } from './lapisApi.ts';

describe('lapisApi', () => {
    test('getSequenceInsertions should order by sequence and position', async () => {
        const api = lapisApi('http://lapis.example');
        const spy = vi.spyOn(axios, 'request').mockResolvedValue({ data: { data: [], info: { dataVersion: '' } } });

        await api.getSequenceInsertions({ accessionVersion: 'LOC_123', type: 'nucleotide' });

        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: 'http://lapis.example',
                url: '/sample/nucleotideInsertions',
                method: 'post',
                data: {
                    accessionVersion: 'LOC_123',
                    orderBy: [
                        { field: 'sequenceName', type: 'ascending' },
                        { field: 'position', type: 'ascending' },
                    ],
                },
            }),
        );
    });
});
