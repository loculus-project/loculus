import { DateTime, FixedOffsetZone } from 'luxon';

import { LapisClient } from '../../services/lapisClient.ts';
import { RELEASED_AT_FIELD } from '../../settings.ts';

export type OrganismStatistics = {
    totalSequences: number;
    recentSequences: number;
    lastUpdatedAt: DateTime | undefined;
};
type OrganismStatisticsMap = Map<string, OrganismStatistics>;

export const getOrganismStatisticsMap = async (
    organismNames: string[],
    numberDaysAgo: number,
): Promise<OrganismStatisticsMap> => {
    const statistics = await Promise.all(
        organismNames.map((organism) => getOrganismStatistics(organism, numberDaysAgo)),
    );
    const result = new Map<string, OrganismStatistics>();
    for (let i = 0; i < organismNames.length; i++) {
        result.set(organismNames[i], statistics[i]);
    }
    return result;
};

const getOrganismStatistics = async (organism: string, numberDaysAgo: number): Promise<OrganismStatistics> => {
    const [{ total, lastUpdatedAt }, recent] = await Promise.all([
        getTotalAndLastUpdatedAt(organism),
        getRecent(organism, numberDaysAgo),
    ]);
    return {
        totalSequences: total,
        recentSequences: recent,
        lastUpdatedAt,
    };
};

const getTotalAndLastUpdatedAt = async (
    organism: string,
): Promise<{ total: number; lastUpdatedAt: DateTime | undefined }> => {
    const client = LapisClient.createForOrganism(organism);
    return (
        await client.call('aggregated', {
            version: 1,
        })
    )
        .map((x) => ({
            total: x.data[0].count,
            lastUpdatedAt: DateTime.fromSeconds(Number.parseInt(x.info.dataVersion, 10), {
                zone: FixedOffsetZone.utcInstance,
            }),
        }))
        .unwrapOr({
            total: 0,
            lastUpdatedAt: undefined,
        });
};

const getRecent = async (organism: string, numberDaysAgo: number): Promise<number> => {
    const recentTimestamp = Math.floor(Date.now() / 1000 - numberDaysAgo * 24 * 60 * 60);
    const client = LapisClient.createForOrganism(organism);
    return (
        await client.call('aggregated', {
            [`${RELEASED_AT_FIELD}From`]: recentTimestamp,
            version: 1,
        })
    )
        .map((x) => x.data[0].count)
        .unwrapOr(0);
};
