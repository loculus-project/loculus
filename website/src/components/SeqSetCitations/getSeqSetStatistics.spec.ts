import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { getSeqSetStatistics } from './getSeqSetStatistics';
import { testServer } from '../../../vitest.setup';
import { ACCESSION_FIELD, ACCESSION_VERSION_FIELD } from '../../settings';
import type { ClientConfig } from '../../types/runtimeConfig';

const ORGANISM_1 = 'test-organism-1';
const ORGANISM_2 = 'test-organism-2';

const ORGANISM_1_ACCESSIONS = ['LOC_123456', 'LOC_789012', 'LOC_345678.1', 'LOC_901234.2'];
const ORGANISM_2_ACCESSIONS = ['LOC_345678', 'LOC_901234', 'LOC_567890.1', 'LOC_123456.2'];

const clientConfig: ClientConfig = {
    backendUrl: 'http://backend.dummy',
    lapisUrls: {
        [ORGANISM_1]: 'http://lapis-1.dummy',
        [ORGANISM_2]: 'http://lapis-2.dummy',
    },
};

const mockAccessions: Record<string, string[]> = {
    [ORGANISM_1]: ORGANISM_1_ACCESSIONS,
    [ORGANISM_2]: ORGANISM_2_ACCESSIONS,
};

const mockResponses: Record<string, Record<string, Record<string, object[]>>> = {
    [ORGANISM_1]: {
        versioned: {
            sampleCollectionDate: [
                { sampleCollectionDate: '2024-01-01', count: 2 },
                { sampleCollectionDate: '2024-06-15', count: 4 },
            ],
            geoLocCountry: [
                { geoLocCountry: 'Switzerland', count: 6 },
                { geoLocCountry: 'USA', count: 8 },
            ],
        },
        unversioned: {
            sampleCollectionDate: [
                { sampleCollectionDate: '2024-01-01', count: 1 },
                { sampleCollectionDate: '2024-06-15', count: 1 },
            ],
            geoLocCountry: [
                { geoLocCountry: 'Switzerland', count: 4 },
                { geoLocCountry: 'USA', count: 2 },
            ],
        },
    },
    [ORGANISM_2]: {
        versioned: {
            sampleCollectionDate: [
                { sampleCollectionDate: '2024-01-01', count: 80 },
                { sampleCollectionDate: '2024-06-15', count: 400 },
            ],
            country: [
                { country: 'USA', count: 7 },
                { country: 'Germany', count: 3 },
            ],
            organismSpecificField: [
                { organismSpecificField: 'valueA', count: 5 },
                { organismSpecificField: 'valueB', count: 2 },
            ],
        },
        unversioned: {
            sampleCollectionDate: [
                { sampleCollectionDate: '2024-01-01', count: 20 },
                { sampleCollectionDate: '2024-06-15', count: 100 },
            ],
            country: [
                { country: 'USA', count: 3 },
                { country: 'Germany', count: 1 },
            ],
            organismSpecificField: [
                { organismSpecificField: 'valueA', count: 2 },
                { organismSpecificField: 'valueB', count: 1 },
            ],
        },
    },
};

type MockParams = {
    [ACCESSION_VERSION_FIELD]: string[] | undefined;
    [ACCESSION_FIELD]: string[] | undefined;
    fields: string[];
};

const mockAggregatedEndpoint = (organism: string) =>
    http.post(`${clientConfig.lapisUrls[organism]}/sample/aggregated`, async ({ request }) => {
        const params = (await request.json()) as MockParams;

        // Determine if the call is for versioned or unversioned accessions
        const isVersioned = params[ACCESSION_VERSION_FIELD] !== undefined;
        const versionType = isVersioned ? 'versioned' : 'unversioned';
        const accessions = (isVersioned ? params[ACCESSION_VERSION_FIELD] : params[ACCESSION_FIELD])!;

        // Check if all accessions in the call match the mock accessions for the organism and version type
        const hasOrganismAccessions = mockAccessions[organism]
            .filter((a) => (isVersioned ? a.includes('.') : !a.includes('.')))
            .every((a) => accessions.includes(a));

        const matchingField = params.fields.find((f) => f in mockResponses[organism][versionType]);
        const data =
            hasOrganismAccessions && matchingField !== undefined
                ? mockResponses[organism][versionType][matchingField]
                : [];
        return new Response(JSON.stringify({ data }));
    });

describe('getSeqSetStatistics', () => {
    beforeEach(() => {
        testServer.use(mockAggregatedEndpoint(ORGANISM_1), mockAggregatedEndpoint(ORGANISM_2));
    });

    it('returns empty array without calling LAPIS when accessions list is empty', async () => {
        const result = await getSeqSetStatistics([], { [ORGANISM_1]: 'sampleCollectionDate' }, clientConfig);
        expect(result).toEqual([]);
    });

    it('returns empty array when no organism has a field to aggregate on', async () => {
        const result = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS, {}, clientConfig);
        expect(result).toEqual([]);
    });

    it('returns aggregated rows for a single organism', async () => {
        const resultDate = await getSeqSetStatistics(
            ORGANISM_1_ACCESSIONS,
            { [ORGANISM_1]: 'sampleCollectionDate' },
            clientConfig,
        );
        expect(resultDate).toEqual([
            { value: '2024-01-01', count: 3 },
            { value: '2024-06-15', count: 5 },
        ]);

        const resultCountry = await getSeqSetStatistics(
            ORGANISM_2_ACCESSIONS,
            { [ORGANISM_2]: 'country' },
            clientConfig,
        );
        expect(resultCountry).toEqual([
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 4 },
        ]);
    });

    it('returns results only from organism 2 when only organism 2 has the field', async () => {
        const result = await getSeqSetStatistics(
            ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS),
            { [ORGANISM_2]: 'organismSpecificField' },
            clientConfig,
        );
        expect(result).toEqual([
            { value: 'valueA', count: 7 },
            { value: 'valueB', count: 3 },
        ]);
    });

    it('returns aggregated rows across multiple organisms', async () => {
        // Organisms have the same field name
        const resultDate = await getSeqSetStatistics(
            ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS),
            { [ORGANISM_1]: 'sampleCollectionDate', [ORGANISM_2]: 'sampleCollectionDate' },
            clientConfig,
        );
        expect(resultDate).toEqual([
            { value: '2024-01-01', count: 103 },
            { value: '2024-06-15', count: 505 },
        ]);

        // Organisms have different field names which are aggregated together
        const resultCountry = await getSeqSetStatistics(
            ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS),
            { [ORGANISM_1]: 'geoLocCountry', [ORGANISM_2]: 'country' },
            clientConfig,
        );
        expect(resultCountry).toEqual([
            { value: 'Switzerland', count: 10 },
            { value: 'USA', count: 20 },
            { value: 'Germany', count: 4 },
        ]);
    });

    it('throws when LAPIS returns an error', async () => {
        testServer.use(
            http.post(
                `${clientConfig.lapisUrls[ORGANISM_1]}/sample/aggregated`,
                () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }),
            ),
        );
        await expect(
            getSeqSetStatistics(ORGANISM_1_ACCESSIONS, { [ORGANISM_1]: 'sampleCollectionDate' }, clientConfig),
        ).rejects.toThrow();
    });
});
