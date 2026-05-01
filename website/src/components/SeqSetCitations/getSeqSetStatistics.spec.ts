import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { getSeqSetStatistics } from './getSeqSetStatistics';
import { ACCESSION_FIELD, ACCESSION_VERSION_FIELD } from '../../settings';

const ORGANISM_1_ACCESSIONS = ['LOC_123456', 'LOC_789012', 'LOC_345678.1', 'LOC_901234.2'];
const ORGANISM_2_ACCESSIONS = ['LOC_345678', 'LOC_901234', 'LOC_567890.1', 'LOC_123456.2'];

const mockAccessions: Record<string, string[]> = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'test-organism-1': ORGANISM_1_ACCESSIONS,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'test-organism-2': ORGANISM_2_ACCESSIONS,
};

const mockResponses: Record<string, Record<string, Record<string, object[]>>> = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'test-organism-1': {
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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'test-organism-2': {
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

vi.mock('../../config.ts', () => ({
    getConfiguredOrganisms: () => [{ key: 'test-organism-1' }, { key: 'test-organism-2' }],
    getSchema: (organism: string) => ({
        metadata:
            organism === 'test-organism-1'
                ? [{ name: 'sampleCollectionDate' }, { name: 'geoLocCountry' }]
                : [{ name: 'sampleCollectionDate' }, { name: 'country' }, { name: 'organismSpecificField' }],
    }),
}));

vi.mock('../../services/lapisClient.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    LapisClient: {
        createForOrganism: vi.fn().mockImplementation((organism: string) => ({
            call: vi.fn().mockImplementation((_method: string, params: MockParams) => {
                // Determine if the call is for versioned or unversioned accessions
                const isVersioned = params[ACCESSION_VERSION_FIELD] !== undefined;
                const versionType = isVersioned ? 'versioned' : 'unversioned';
                const accessions = (isVersioned ? params[ACCESSION_VERSION_FIELD] : params[ACCESSION_FIELD])!;

                // Check if all accessions in the call match the mock accessions for the organism and version type
                const hasOrganismAccessions = mockAccessions[organism]
                    .filter((a) => (isVersioned ? a.includes('.') : !a.includes('.')))
                    .every((a) => accessions.includes(a));

                const matchingField = params.fields.find((f) => f in mockResponses[organism][versionType]);
                if (hasOrganismAccessions && matchingField !== undefined) {
                    return Promise.resolve(ok({ data: mockResponses[organism][versionType][matchingField] }));
                }
                return Promise.resolve(ok({ data: [] }));
            }),
        })),
    },
}));

describe('getSeqSetStatistics', () => {
    it('returns empty array without calling LAPIS when accessions list is empty', async () => {
        const result = await getSeqSetStatistics([], ['sampleCollectionDate']);
        expect(result.isOk()).toBe(true);
        expect(result.unwrapOr(undefined)).toEqual([]);
    });

    it('returns empty array when no fieldOptions match the organism schemas', async () => {
        const result = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS, ['nonExistentField']);
        expect(result.isOk()).toBe(true);
        expect(result.unwrapOr(undefined)).toEqual([]);
    });

    it('returns aggregated rows for a single organism', async () => {
        const resultDate = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS, ['sampleCollectionDate']);
        expect(resultDate.isOk()).toBe(true);
        expect(resultDate.unwrapOr(undefined)).toEqual([
            { value: '2024-01-01', count: 3 },
            { value: '2024-06-15', count: 5 },
        ]);

        const resultCountry = await getSeqSetStatistics(ORGANISM_2_ACCESSIONS, ['country']);
        expect(resultCountry.isOk()).toBe(true);
        expect(resultCountry.unwrapOr(undefined)).toEqual([
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 4 },
        ]);
    });

    it('returns results only from organism 2 when field only exists in organism 2 schema', async () => {
        const result = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS), [
            'organismSpecificField',
        ]);
        expect(result.isOk()).toBe(true);
        expect(result.unwrapOr(undefined)).toEqual([
            { value: 'valueA', count: 7 },
            { value: 'valueB', count: 3 },
        ]);
    });

    it('returns aggregated rows across multiple organisms', async () => {
        // Organisms have the same field name
        const resultDate = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS), [
            'sampleCollectionDate',
        ]);
        expect(resultDate.isOk()).toBe(true);
        expect(resultDate.unwrapOr(undefined)).toEqual([
            { value: '2024-01-01', count: 103 },
            { value: '2024-06-15', count: 505 },
        ]);

        // Organisms have different field names which are aggregated together
        const resultCountry = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS), [
            'geoLocCountry',
            'country',
        ]);
        expect(resultCountry.isOk()).toBe(true);
        expect(resultCountry.unwrapOr(undefined)).toEqual([
            { value: 'Switzerland', count: 10 },
            { value: 'USA', count: 20 },
            { value: 'Germany', count: 4 },
        ]);
    });
});
