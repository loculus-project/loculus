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
type OrganismStatisticsMap = Map<string, OrganismStatistics | undefined>;

const TIMEOUT_MS = 500;

export const getOrganismStatisticsMap = async (
    organismNames: string[],
    numberDaysAgo: number,
    authorization?: string,
): Promise<OrganismStatisticsMap> => {
    const statistics = await Promise.all(
        organismNames.map((organism) => getOrganismStatistics(organism, numberDaysAgo, authorization)),
    );
    const result = new Map<string, OrganismStatistics | undefined>();
    for (let i = 0; i < organismNames.length; i++) {
        result.set(organismNames[i], statistics[i]);
    }
    return result;
};

const getOrganismStatistics = async (
    organism: string,
    numberDaysAgo: number,
    authorization?: string,
): Promise<OrganismStatistics | undefined> => {
    const [totalAndLastUpdatedAt, recent] = await Promise.all([
        withTimeout(getTotalAndLastUpdatedAt(organism, authorization), TIMEOUT_MS, undefined),
        withTimeout(getRecent(organism, numberDaysAgo, authorization), TIMEOUT_MS, undefined),
    ]);
    if (totalAndLastUpdatedAt === undefined || recent === undefined) {
        // LAPIS unreachable or rejected the request (e.g. anonymous request while
        // `lapisAuthEnabled`): hide the statistics instead of showing misleading zeros.
        return undefined;
    }
    return {
        totalSequences: totalAndLastUpdatedAt.total,
        recentSequences: recent,
        lastUpdatedAt: totalAndLastUpdatedAt.lastUpdatedAt,
    };
};

const withTimeout = <T>(promise: Promise<T>, ms: number, defaultValue: T): Promise<T> => {
    const timeout = new Promise<T>((resolve) => setTimeout(() => resolve(defaultValue), ms));
    return Promise.race([promise, timeout]);
};

const getTotalAndLastUpdatedAt = async (
    organism: string,
    authorization?: string,
): Promise<{ total: number; lastUpdatedAt: DateTime | undefined } | undefined> => {
    const client = LapisClient.createForOrganism(organism, authorization);
    const result = await client.call('aggregated', {
        [VERSION_STATUS_FIELD]: versionStatuses.latestVersion,
        [IS_REVOCATION_FIELD]: 'false',
    });
    if (result.isErr()) {
        return undefined;
    }
    return {
        total: result.value.data[0].count,
        lastUpdatedAt: DateTime.fromSeconds(Number.parseInt(result.value.info.dataVersion, 10), {
            zone: FixedOffsetZone.utcInstance,
        }),
    };
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
const getRecent = async (
    organism: string,
    numberDaysAgo: number,
    authorization?: string,
): Promise<number | undefined> => {
    const recentFilter = getRecentFilter(organism, numberDaysAgo);
    const client = LapisClient.createForOrganism(organism, authorization);
    const recentlyReleasedTotal = await client.call('aggregated', {
        ...recentFilter,
        version: 1,
    });
    const recentlyReleasedThenRevokedTotal = await client.call('aggregated', {
        ...recentFilter,
        version: 1,
        [VERSION_STATUS_FIELD]: versionStatuses.revoked,
    });
    if (recentlyReleasedTotal.isErr() || recentlyReleasedThenRevokedTotal.isErr()) {
        return undefined;
    }
    return recentlyReleasedTotal.value.data[0].count - recentlyReleasedThenRevokedTotal.value.data[0].count;
};
