import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from 'vitest';

import { GET } from './sequences.ts';
import { mockRequest, testConfig } from '../../../../vitest.setup.ts';
import { getConfiguredOrganisms, getLapisUrl, getReferenceGenome, getRuntimeConfig } from '../../../config.ts';

vi.mock('../../../config.ts', () => ({
    getConfiguredOrganisms: vi.fn(),
    getReferenceGenome: vi.fn(),
    getLapisUrl: vi.fn(),
    getSchema: vi.fn(),
    getRuntimeConfig: vi.fn(),
}));

const organism = 'testOrganism';

const getConfiguredOrganismsMock = getConfiguredOrganisms as Mock<typeof getConfiguredOrganisms>;
const getReferenceGenomeMock = getReferenceGenome as Mock<typeof getReferenceGenome>;
const getLapisUrlMock = getLapisUrl as Mock<typeof getLapisUrl>;
const getRuntimeConfigMock = getRuntimeConfig as Mock<typeof getRuntimeConfig>;

function mockSingleSegmented() {
    getReferenceGenomeMock.mockImplementation(() => ({
        nucleotideSequences: [{ name: 'main', sequence: 'ACGT' }],
        genes: [],
    }));
}

function mockMultiSegmented() {
    getReferenceGenomeMock.mockImplementation(() => ({
        nucleotideSequences: [
            { name: 'segment1', sequence: 'ACGT' },
            { name: 'segment2', sequence: 'ACGT' },
        ],
        genes: [],
    }));
}

describe('The sequences endpoint', () => {
    beforeEach(() => {
        getConfiguredOrganismsMock.mockImplementation(() => [
            {
                key: organism,
                displayName: organism,
                image: undefined,
                description: undefined,
            },
        ]);
        getRuntimeConfigMock.mockImplementation(() => testConfig);
        getLapisUrlMock.mockImplementation(() => testConfig.serverSide.lapisUrls.dummy);
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('when single segmented', () => {
        beforeEach(() => {
            mockSingleSegmented();
        });

        test('should require headerFields', async () => {
            const response = await GET(makeRequest(new URLSearchParams()));

            await expect(response.json()).resolves.toHaveProperty(
                'detail',
                "Missing required parameter: 'headerFields'",
            );
            expect(response.status).toBe(400);
        });

        test('should reject request when segment is set', async () => {
            getReferenceGenomeMock.mockImplementation(() => ({
                nucleotideSequences: [{ name: 'main', sequence: 'ACGT' }],
                genes: [],
            }));
            const response = await GET(
                makeRequest(new URLSearchParams({ headerFields: 'field1', segment: 'my segment' })),
            );

            await expect(response.json()).resolves.toHaveProperty(
                'detail',
                "Parameter 'segment' not allowed for single-segmented organism",
            );
            expect(response.status).toBe(400);
        });

        test('should fail when the data version of details and sequences do not match', async () => {
            mockRequest.lapis.details(200, { data: [], info: { dataVersion: 'dataVersion1' } });
            mockRequest.lapis.unalignedNucleotideSequences(200, '', 'dataVersion2');

            const response = await GET(makeRequest(new URLSearchParams({ headerFields: 'field1' })));

            await expect(response.json()).resolves.toHaveProperty(
                'detail',
                'Data version mismatch: sequences dataVersion2 vs details dataVersion1',
            );
            expect(response.status).toBe(503);
        });
    });

    describe('when multi segmented', () => {
        beforeEach(() => {
            mockMultiSegmented();
        });

        test('should require segment', async () => {
            const response = await GET(makeRequest(new URLSearchParams({ headerFields: 'field1' })));

            await expect(response.json()).resolves.toHaveProperty('detail', "Missing required parameter: 'segment'");
            expect(response.status).toBe(400);
        });

        test('should reject request when unknown segment given', async () => {
            const response = await GET(
                makeRequest(new URLSearchParams({ headerFields: 'field1', segment: 'my segment' })),
            );

            await expect(response.json()).resolves.toHaveProperty(
                'detail',
                "Unknown segment 'my segment', known segments are segment1, segment2",
            );
            expect(response.status).toBe(400);
        });

        test('should fail when the data version of details and sequences do not match', async () => {
            const segmentName = 'segment1';

            mockRequest.lapis.details(200, { data: [], info: { dataVersion: 'dataVersion1' } });
            mockRequest.lapis.unalignedNucleotideSequencesMultiSegment(200, '', segmentName, 'dataVersion2');

            const response = await GET(
                makeRequest(
                    new URLSearchParams({
                        headerFields: 'field1',
                        segment: segmentName,
                    }),
                ),
            );

            await expect(response.json()).resolves.toHaveProperty(
                'detail',
                'Data version mismatch: sequences dataVersion2 vs details dataVersion1',
            );
            expect(response.status).toBe(503);
        });
    });
});

function makeRequest(searchParams: URLSearchParams) {
    return {
        params: { organism: organism },
        request: new Request(new URL(`http://localhost:3000?${searchParams}`)),
    } as APIContext<never, { organism: string }>;
}
