/**
 * Process-wide wiring of the website's server-side caches, configured from the environment at runtime:
 *
 * - `LAPIS_CACHE_MEMORY_MB` (unset or 0: off), `LAPIS_CACHE_DISK_MB`, `LAPIS_CACHE_FRESH_SECONDS`
 * - `PAGE_CACHE_MEMORY_MB` (unset or 0: off), `PAGE_CACHE_DISK_MB`, `PAGE_CACHE_EDGE_HEADERS` (`true`: send
 *   `Cache-Control: public, s-maxage…` on anonymous cacheable pages)
 * - `WEBSITE_CACHE_DIR`: disk tiers live in `<dir>/lapis` and `<dir>/pages`; no disk tier without it
 * - `WEBSITE_CACHE_VERSION_POLL_SECONDS` (60), `WEBSITE_CACHE_OLD_VERSION_GRACE_SECONDS` (120),
 *   `WEBSITE_CACHE_MAX_AGE_HOURS` (24)
 */
import path from 'node:path';

import axios, { type AxiosAdapter } from 'axios';

import { DataVersionTracker } from './dataVersions.ts';
import { createCacheMaintenance, MAX_DICTIONARY_BYTES, PageCache, PageCodec } from './pageCache.ts';
import { DiskBlobStore, emptyStoreStats, type StoreStats, TieredBlobStore } from './serverCacheStore.ts';
import {
    createServerLapisCache,
    organismOfUrl,
    type ServerLapisCache,
    type ServerLapisCacheConfig,
} from './serverLapisCache.ts';
import { getConfiguredOrganisms, getLapisUrl, getRuntimeConfig } from '../../config.ts';
import { getInstanceLogger } from '../../logger.ts';

const MiB = 1024 * 1024;
/** Renders are admitted to the page cache this long after the SSR LAPIS freshness window has passed. */
const ADMISSION_MARGIN_MS = 10_000;
const STATS_LOG_INTERVAL_MS = 60_000;
const MAX_SWEEP_INTERVAL_MS = 10 * 60_000;

export type PageCacheConfig = {
    memoryBytes: number;
    diskBytes: number;
    dir: string | undefined;
    edgeCacheHeaders: boolean;
};

export type WebsiteCacheConfig = {
    lapis: ServerLapisCacheConfig | undefined;
    pages: PageCacheConfig | undefined;
    pollMs: number;
    graceMs: number;
    maxAgeMs: number;
};

export function websiteCacheConfigFromEnv(env: Record<string, string | undefined>): WebsiteCacheConfig {
    const number = (name: string, fallback: number) => {
        const raw = env[name];
        const value = raw === undefined || raw === '' ? fallback : Number(raw);
        return Number.isFinite(value) && value > 0 ? value : 0;
    };
    const dir = env.WEBSITE_CACHE_DIR !== undefined && env.WEBSITE_CACHE_DIR !== '' ? env.WEBSITE_CACHE_DIR : undefined;
    const tier = (prefix: string, subdirectory: string) => {
        const memoryBytes = Math.floor(number(`${prefix}_MEMORY_MB`, 0) * MiB);
        const diskBytes = dir === undefined ? 0 : Math.floor(number(`${prefix}_DISK_MB`, 0) * MiB);
        return memoryBytes === 0
            ? undefined
            : {
                  memoryBytes,
                  diskBytes,
                  dir: diskBytes > 0 && dir !== undefined ? path.join(dir, subdirectory) : undefined,
              };
    };
    const lapisTier = tier('LAPIS_CACHE', 'lapis');
    const pageTier = tier('PAGE_CACHE', 'pages');
    return {
        lapis: lapisTier && { ...lapisTier, freshMs: Math.floor(number('LAPIS_CACHE_FRESH_SECONDS', 0) * 1000) },
        pages: pageTier && { ...pageTier, edgeCacheHeaders: env.PAGE_CACHE_EDGE_HEADERS === 'true' },
        pollMs: Math.floor(number('WEBSITE_CACHE_VERSION_POLL_SECONDS', 60) * 1000),
        graceMs: Math.floor(number('WEBSITE_CACHE_OLD_VERSION_GRACE_SECONDS', 120) * 1000),
        maxAgeMs: Math.floor(number('WEBSITE_CACHE_MAX_AGE_HOURS', 24) * 3600 * 1000),
    };
}

type WebsiteCaches = { lapis: ServerLapisCache | undefined; pages: PageCache | undefined };

let caches: WebsiteCaches | undefined;

function initialise(): WebsiteCaches {
    const config = websiteCacheConfigFromEnv(process.env);
    if (config.lapis === undefined && config.pages === undefined) {
        return { lapis: undefined, pages: undefined };
    }
    const logger = getInstanceLogger('websiteCache');
    const onError = (message: string) => logger.warn(message);
    const organisms = getConfiguredOrganisms().map(({ key }) => key);
    const lapisUrls = Object.fromEntries(
        organisms.map((organism) => [organism, getLapisUrl(getRuntimeConfig().serverSide, organism)]),
    );

    let onVersionChange: (organism: string) => void = () => {};
    const versions = new DataVersionTracker(
        organisms,
        async (organism) => {
            const response = await axios.get<{ dataVersion?: unknown }>(`${lapisUrls[organism]}/sample/info`, {
                timeout: 10_000,
            });
            const dataVersion = response.data.dataVersion;
            if (typeof dataVersion !== 'string' && typeof dataVersion !== 'number') {
                throw new Error('no dataVersion in /sample/info');
            }
            return String(dataVersion);
        },
        {
            onError,
            onChange: (organism, previous, next) => {
                logger.info(`website cache: ${organism} data version ${previous} -> ${next}`);
                onVersionChange(organism);
            },
        },
    );

    const lapis =
        config.lapis &&
        createServerLapisCache(config.lapis, {
            maxAgeMs: config.maxAgeMs,
            organismOf: organismOfUrl(lapisUrls),
            versions,
            onError,
        });

    let pages: PageCache | undefined;
    const pageStoreStats = emptyStoreStats();
    if (config.pages !== undefined) {
        const codec = new PageCodec();
        const storeStats = pageStoreStats;
        const dictionaryReserve = codec.kind === 'zstd-dict' ? organisms.length * MAX_DICTIONARY_BYTES : 0;
        const memoryBytes = Math.max(config.pages.memoryBytes - dictionaryReserve, config.pages.memoryBytes / 4);
        const disk =
            config.pages.dir === undefined
                ? undefined
                : new DiskBlobStore(config.pages.dir, config.pages.diskBytes, storeStats, undefined, onError);
        pages = new PageCache(new TieredBlobStore(memoryBytes, disk, storeStats), versions, codec, {
            maxAgeMs: config.maxAgeMs,
            admitAfterMs: (config.lapis?.freshMs ?? 0) + ADMISSION_MARGIN_MS,
            edgeCacheHeaders: config.pages.edgeCacheHeaders,
        });
        logger.info(`website page cache: codec ${codec.kind}`);
    }

    const maintenance = createCacheMaintenance({
        stores: [lapis?.blobs, pages?.blobs].filter((store) => store !== undefined),
        versions,
        graceMs: config.graceMs,
        maxAgeMs: config.maxAgeMs,
        onSwept: (message) => logger.info(message),
    });
    onVersionChange = maintenance.onVersionChange;
    setInterval(() => maintenance.sweepExpired(), Math.min(config.maxAgeMs / 6, MAX_SWEEP_INTERVAL_MS)).unref();
    versions.start(config.pollMs);

    logger.info(`website cache enabled: ${JSON.stringify(config)}`);
    startStatsLog({ lapis, pages }, pageStoreStats, (message) => logger.info(message));
    return { lapis, pages };
}

function getCaches(): WebsiteCaches {
    if (caches === undefined) {
        try {
            caches = initialise();
        } catch (e) {
            getInstanceLogger('websiteCache').error(
                `website cache disabled, could not initialise: ${(e as Error).message}`,
            );
            caches = { lapis: undefined, pages: undefined };
        }
    }
    return caches;
}

/** The SSR LAPIS cache adapter, or undefined when `LAPIS_CACHE_MEMORY_MB` is not set. */
export function getServerLapisCacheAdapter(): AxiosAdapter | undefined {
    return getCaches().lapis?.adapter;
}

/** The page cache, or undefined when `PAGE_CACHE_MEMORY_MB` is not set. */
export function getPageCache(): PageCache | undefined {
    return getCaches().pages;
}

function startStatsLog({ lapis, pages }: WebsiteCaches, pageStoreStats: StoreStats, log: (message: string) => void) {
    let last = '';
    setInterval(() => {
        const counters = JSON.stringify({
            lapis: lapis && { ...lapis.stats, ...lapis.storeStats },
            pages: pages && { ...pages.stats, ...pageStoreStats },
        });
        if (counters === last) {
            return;
        }
        last = counters;
        log(
            `website cache stats: ${JSON.stringify({
                lapis: lapis && { ...lapis.stats, ...lapis.storeStats, ...lapis.blobs.usage() },
                pages: pages && {
                    ...pages.stats,
                    ...pageStoreStats,
                    ...pages.blobs.usage(),
                    dictionaryBytes: pages.codec.dictionaryBytes,
                },
            })}`,
        );
    }, STATS_LOG_INTERVAL_MS).unref();
}
