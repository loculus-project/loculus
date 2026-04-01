import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { getSeqSetStatistics } from './getSeqSetStatistics';
import { ACCESSION_VERSION_FIELD } from '../../settings';

const ORGANISM_1_ACCESSIONS = vi.hoisted(() => ['LOC_123456', 'LOC_789012']);
const ORGANISM_2_ACCESSIONS = vi.hoisted(() => ['LOC_345678', 'LOC_901234']);

vi.mock('../../config.ts', () => ({
    getConfiguredOrganisms: () => [{ key: 'test-organism-1' }, { key: 'test-organism-2' }],
    getSchema: (organism: string) => ({
        metadata:
            organism === 'test-organism-1'
                ? [{ name: 'sampleCollectionDate' }, { name: 'geoLocCountry' }]
                : [{ name: 'sampleCollectionDate' }, { name: 'geoLocCountry' }, { name: 'organismSpecificField' }],
    }),
}));

vi.mock('../../services/lapisClient.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    LapisClient: {
        createForOrganism: vi.fn().mockImplementation((organism: string) => ({
            call: vi
                .fn()
                .mockImplementation(
                    (_method: string, params: { [ACCESSION_VERSION_FIELD]: string[]; fields: string[] }) => {
                        if (params.fields.includes('sampleCollectionDate')) {
                            if (
                                organism === 'test-organism-1' &&
                                params[ACCESSION_VERSION_FIELD].some((accession) =>
                                    ORGANISM_1_ACCESSIONS.includes(accession),
                                )
                            ) {
                                return Promise.resolve(
                                    ok({
                                        data: [
                                            { sampleCollectionDate: '2024-01-01', count: 3 },
                                            { sampleCollectionDate: '2024-06-15', count: 5 },
                                        ],
                                    }),
                                );
                            }
                            if (
                                organism === 'test-organism-2' &&
                                params[ACCESSION_VERSION_FIELD].some((accession) =>
                                    ORGANISM_2_ACCESSIONS.includes(accession),
                                )
                            ) {
                                return Promise.resolve(
                                    ok({
                                        data: [
                                            { sampleCollectionDate: '2024-01-01', count: 100 },
                                            { sampleCollectionDate: '2024-06-15', count: 500 },
                                        ],
                                    }),
                                );
                            }
                        }
                        if (params.fields.includes('organismSpecificField')) {
                            if (
                                organism === 'test-organism-2' &&
                                params[ACCESSION_VERSION_FIELD].some((accession) =>
                                    ORGANISM_2_ACCESSIONS.includes(accession),
                                )
                            ) {
                                return Promise.resolve(
                                    ok({
                                        data: [
                                            { organismSpecificField: 'valueA', count: 7 },
                                            { organismSpecificField: 'valueB', count: 3 },
                                        ],
                                    }),
                                );
                            }
                        }
                        if (params.fields.includes('geoLocCountry')) {
                            if (
                                organism === 'test-organism-1' &&
                                params[ACCESSION_VERSION_FIELD].some((accession) =>
                                    ORGANISM_1_ACCESSIONS.includes(accession),
                                )
                            ) {
                                return Promise.resolve(
                                    ok({
                                        data: [{ geoLocCountry: 'Switzerland', count: 10 }],
                                    }),
                                );
                            }
                            if (
                                organism === 'test-organism-2' &&
                                params[ACCESSION_VERSION_FIELD].some((accession) =>
                                    ORGANISM_2_ACCESSIONS.includes(accession),
                                )
                            ) {
                                return Promise.resolve(
                                    ok({
                                        data: [
                                            { geoLocCountry: 'USA', count: 10 },
                                            { geoLocCountry: 'Germany', count: 4 },
                                        ],
                                    }),
                                );
                            }
                        }
                        return Promise.resolve(ok({ data: [] }));
                    },
                ),
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

        const resultCountry = await getSeqSetStatistics(ORGANISM_2_ACCESSIONS, ['geoLocCountry', 'country']);
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
        const resultDate = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS), [
            'sampleCollectionDate',
        ]);
        expect(resultDate.isOk()).toBe(true);
        expect(resultDate.unwrapOr(undefined)).toEqual([
            { value: '2024-01-01', count: 103 },
            { value: '2024-06-15', count: 505 },
        ]);

        const resultCountry = await getSeqSetStatistics(ORGANISM_1_ACCESSIONS.concat(ORGANISM_2_ACCESSIONS), [
            'geoLocCountry',
        ]);
        expect(resultCountry.isOk()).toBe(true);
        expect(resultCountry.unwrapOr(undefined)).toEqual([
            { value: 'Switzerland', count: 10 },
            { value: 'USA', count: 10 },
            { value: 'Germany', count: 4 },
        ]);
    });
});
