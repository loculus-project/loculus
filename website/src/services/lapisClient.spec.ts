import { http } from 'msw';
import { ok } from 'neverthrow';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { LapisClient } from './lapisClient.ts';
import { testServer } from '../../vitest.setup.ts';
import type { Schema } from '../types/config.ts';
import type { InsertionsResponse } from '../types/lapis.ts';

vi.mock('../utils/KeycloakClientManager.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- must match the real export
    KeycloakClientManager: {
        getClient: vi.fn(),
    },
}));

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

describe('LapisClient', () => {
    beforeEach(() => {
        testServer.resetHandlers();
    });

    test('getSequenceInsertions should order by sequence and position', async () => {
        const client = LapisClient.create('http://lapis.example', schema);
        const spy = vi
            .spyOn(client, 'call')
            .mockResolvedValue(ok({ data: [], info: { dataVersion: '' } } as InsertionsResponse));

        await client.getSequenceInsertions('LOC_123', 'nucleotide');

        expect(spy).toHaveBeenCalledWith('nucleotideInsertions', {
            [schema.primaryKey]: 'LOC_123',
            orderBy: [
                { field: 'sequenceName', type: 'ascending' },
                { field: 'position', type: 'ascending' },
            ],
        });
    });

    describe('authorization', () => {
        const mockLapisEndpoint = (endpoint: string, authorizationHeaders: Record<string, string | null>) => {
            testServer.use(
                http.post(`http://lapis.example/sample/${endpoint}`, ({ request }) => {
                    authorizationHeaders[endpoint] = request.headers.get('authorization');
                    return new Response(JSON.stringify({ data: [], info: { dataVersion: '' } }), {
                        status: 200,
                    });
                }),
            );
        };

        test('attaches the given authorization token to getDetails (direct axios request)', async () => {
            const authorizationHeaders: Record<string, string | null> = {};
            mockLapisEndpoint('details', authorizationHeaders);

            const client = LapisClient.create('http://lapis.example', schema, undefined, 'user-token');
            const result = await client.getDetails({});

            expect(result.isOk()).toBe(true);
            expect(authorizationHeaders).toEqual({ details: 'Bearer user-token' });
        });

        test('attaches the given authorization token to Zodios-based requests (call) and to streaming requests', async () => {
            const authorizationHeaders: Record<string, string | null> = {};
            // getSequenceInsertions goes through this.call() -> Zodios -> { axiosInstance }
            mockLapisEndpoint('nucleotideInsertions', authorizationHeaders);
            // streamSequences uses the axios instance directly
            mockLapisEndpoint('unalignedNucleotideSequences', authorizationHeaders);

            const client = LapisClient.create('http://lapis.example', schema, undefined, 'user-token');
            const insertionsResult = await client.getSequenceInsertions('LOC_123', 'nucleotide');
            const streamResponse = await client.streamSequences(undefined, {});

            expect(insertionsResult.isOk()).toBe(true);
            expect(streamResponse.status).toBe(200);
            expect(authorizationHeaders).toEqual({
                nucleotideInsertions: 'Bearer user-token',
                unalignedNucleotideSequences: 'Bearer user-token',
            });
        });

        test('sends no Authorization header when no token is given', async () => {
            const authorizationHeaders: Record<string, string | null> = {};
            mockLapisEndpoint('details', authorizationHeaders);

            const client = LapisClient.create('http://lapis.example', schema);
            const result = await client.getDetails({});

            expect(result.isOk()).toBe(true);
            expect(authorizationHeaders).toEqual({ details: null });
        });
    });
});
