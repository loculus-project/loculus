import { DateTime, FixedOffsetZone } from 'luxon';

import { getSchema } from '../../config.ts';
import { LapisClient } from '../../services/lapisClient.ts';
import {
    EARLIEST_RELEASE_DATE_FIELD,
    RELEASED_AT_FIELD,
    VERSION_STATUS_FIELD,
    IS_REVOCATION_FIELD,
} from '../../settings.ts';
import { versionStatuses } from '../../types/lapis';

export type OrganismStatistics = {
    totalSequences: number;
    recentSequences: number;
    lastUpdatedAt: DateTime | undefined;
};
type OrganismStatisticsMap = Map<string, OrganismStatistics>;

const TIMEOUT_MS = 500;

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
        withTimeout(getTotalAndLastUpdatedAt(organism), TIMEOUT_MS, { total: -1, lastUpdatedAt: undefined }),
        withTimeout(getRecent(organism, numberDaysAgo), TIMEOUT_MS, 0),
    ]);
    return {
        totalSequences: total,
        recentSequences: recent,
        lastUpdatedAt,
    };
};

const withTimeout = <T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> => {
    const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(defaultValue), ms));
    return Promise.race([promise, timeout]);
};

const getTotalAndLastUpdatedAt = async (
    organism: string,
): Promise<{ total: number; lastUpdatedAt: DateTime | undefined }> => {
    const client = LapisClient.createForOrganism(organism);
    // versionStatus=LATEST_VERSION & isRevocation=false are query-service defaults.
    return (
        await client.call('aggregated', {}, { queries: { organism: client.organism } })
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

const hasEarliestReleaseDateField = (organism: string): boolean =>
    getSchema(organism).metadata.some((field) => field.name === EARLIEST_RELEASE_DATE_FIELD);

/**
 * Builds the LAPIS filter that selects sequences released within the recency window.
 *
 * If the organism configures the `earliestReleaseDate` metadata field, that date field is used
 * so that sequences imported from external sources (e.g. INSDC) are counted by their original
 * release date rather than their import date into Loculus. Otherwise the internal
 * `releasedAtTimestamp` is used.
 */
const getRecentFilter = (organism: string, numberDaysAgo: number): Record<string, string | number> => {
    if (hasEarliestReleaseDateField(organism)) {
        const recentDate = DateTime.utc().minus({ days: numberDaysAgo }).toISODate();
        return { [`${EARLIEST_RELEASE_DATE_FIELD}From`]: recentDate };
    }
    const recentTimestamp = Math.floor(Date.now() / 1000 - numberDaysAgo * 24 * 60 * 60);
    return { [`${RELEASED_AT_FIELD}From`]: recentTimestamp };
};

/**
 * Note: This method undercounts in cases where recently released sequences
 * are later revoked and then unrevoked (revised), all within the "recency window".
 * This trade-off allows for a simpler, more efficient query
 * without needing to fetch individual accession lists.
 */
const getRecent = async (organism: string, numberDaysAgo: number): Promise<number> => {
    const recentFilter = getRecentFilter(organism, numberDaysAgo);
    const client = LapisClient.createForOrganism(organism);
    const organismQueries = { queries: { organism: client.organism } };
    const recentlyReleasedTotal = (
        await client.call('aggregated', {
            ...recentFilter,
            version: 1,
        })
    )
        .map((x) => x.data[0].count)
        .unwrapOr(0);
    const recentlyReleasedThenRevokedTotal = (
        await client.call('aggregated', {
            ...recentFilter,
            version: 1,
            [VERSION_STATUS_FIELD]: versionStatuses.revoked,
        })
    )
        .map((x) => x.data[0].count)
        .unwrapOr(0);
    return recentlyReleasedTotal - recentlyReleasedThenRevokedTotal;
};
