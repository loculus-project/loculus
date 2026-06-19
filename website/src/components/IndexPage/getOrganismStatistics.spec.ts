import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOrganismStatisticsMap } from './getOrganismStatistics';
import { EARLIEST_RELEASE_DATE_FIELD, VERSION_STATUS_FIELD } from '../../settings';
import { versionStatuses } from '../../types/lapis';

const getCurrentAggregated = vi.fn();
const getAllVersionsAggregated = vi.fn();

vi.mock('../../config.ts', () => ({
    getSchema: () => ({
        metadata: [{ name: EARLIEST_RELEASE_DATE_FIELD }],
    }),
}));

vi.mock('../../services/lapisClient.ts', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    LapisClient: {
        createForOrganism: vi.fn(() => ({
            getCurrentAggregated,
            getAllVersionsAggregated,
        })),
    },
}));

describe('getOrganismStatisticsMap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('computes recent counts from all versions so revoked releases can be subtracted', async () => {
        getCurrentAggregated.mockResolvedValue(ok({ data: [{ count: 25 }], info: { dataVersion: '1780000000' } }));
        getAllVersionsAggregated
            .mockResolvedValueOnce(ok({ data: [{ count: 7 }] }))
            .mockResolvedValueOnce(ok({ data: [{ count: 2 }] }));

        const statistics = await getOrganismStatisticsMap(['cchf'], 30, 'test-token');

        expect(statistics.get('cchf')?.totalSequences).toBe(25);
        expect(statistics.get('cchf')?.recentSequences).toBe(5);
        expect(getCurrentAggregated).toHaveBeenCalledTimes(1);
        expect(getAllVersionsAggregated).toHaveBeenCalledTimes(2);
        expect(getAllVersionsAggregated).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                [`${EARLIEST_RELEASE_DATE_FIELD}From`]: expect.any(String),
                version: 1,
            }),
        );
        expect(getAllVersionsAggregated).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                [`${EARLIEST_RELEASE_DATE_FIELD}From`]: expect.any(String),
                version: 1,
                [VERSION_STATUS_FIELD]: versionStatuses.revoked,
            }),
        );
    });

    it('returns zero counts without an access token', async () => {
        const statistics = await getOrganismStatisticsMap(['cchf'], 30, undefined);

        expect(statistics.get('cchf')).toEqual({
            totalSequences: 0,
            recentSequences: 0,
            lastUpdatedAt: undefined,
        });
        expect(getCurrentAggregated).not.toHaveBeenCalled();
        expect(getAllVersionsAggregated).not.toHaveBeenCalled();
    });
});
