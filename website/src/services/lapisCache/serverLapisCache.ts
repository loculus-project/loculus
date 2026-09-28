/**
 * SSR-side LAPIS cache: the conditional-request adapter over a memory → disk store. Server-only.
 */
import type { AxiosAdapter } from 'axios';

import {
    type CacheLookup,
    type ConditionalCacheStats,
    type ConditionalCacheStore,
    createConditionalCacheAdapter,
    emptyStats,
    type StoredResponse,
} from './conditionalCache.ts';
import type { DataVersionSource } from './dataVersions.ts';
import { DiskBlobStore, emptyStoreStats, type StoreStats, TieredBlobStore } from './serverCacheStore.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The URL inside a key built by `requestCacheKey`. */
const urlOfKey = (key: string): string | undefined => {
    try {
        const parsed = JSON.parse(key) as unknown;
        return Array.isArray(parsed) && typeof parsed[1] === 'string' ? parsed[1] : undefined;
    } catch (_) {
        return undefined;
    }
};

/**
 * Maps a LAPIS request URL to its organism by the organism's LAPIS base URL. The trailing slash keeps `…/ebola` from
 * matching `…/ebola-sudan`.
 */
export function organismOfUrl(lapisUrls: Record<string, string>): (url: string) => string | undefined {
    const prefixes = Object.entries(lapisUrls).map(([organism, url]) => [organism, url.replace(/\/+$/, '') + '/']);
    return (url) => prefixes.find(([, prefix]) => url.startsWith(prefix))?.[0];
}

export type LapisResponseStoreOptions = {
    now?: () => number;
    maxAgeMs?: number;
    organismOf?: (url: string) => string | undefined;
    versions?: DataVersionSource;
};

/** LAPIS responses as UTF-8 blobs, tagged with their organism and its data version for purging. */
export class LapisResponseStore implements ConditionalCacheStore {
    private readonly now: () => number;
    private readonly maxAgeMs: number;

    constructor(
        public readonly blobs: TieredBlobStore,
        private readonly stats: StoreStats,
        private readonly options: LapisResponseStoreOptions = {},
    ) {
        this.now = options.now ?? Date.now;
        this.maxAgeMs = options.maxAgeMs ?? DAY_MS;
    }

    private classify(key: string) {
        const url = urlOfKey(key);
        const group = url === undefined ? undefined : this.options.organismOf?.(url);
        return { group, version: group === undefined ? undefined : this.options.versions?.current(group)?.version };
    }

    public lookup(key: string): CacheLookup | undefined {
        const hit = this.blobs.lookup(key);
        if (hit === undefined) {
            return undefined;
        }
        if (this.now() - hit.meta.storedAt > this.maxAgeMs) {
            this.stats.expired++;
            this.blobs.delete(key);
            return undefined;
        }
        return {
            etag: hit.meta.tag,
            validatedAt: hit.meta.validatedAt,
            load: async () => {
                const body = await hit.load();
                return body === undefined
                    ? undefined
                    : { body: body.toString('utf8'), contentType: hit.meta.contentType };
            },
        };
    }

    public put(key: string, etag: string, response: StoredResponse, validatedAt: number): boolean {
        return this.blobs.put(
            key,
            { tag: etag, storedAt: this.now(), validatedAt, contentType: response.contentType, ...this.classify(key) },
            Buffer.from(response.body, 'utf8'),
        );
    }

    public confirm(key: string, validatedAt: number): void {
        this.blobs.confirm(key, validatedAt, this.classify(key).version);
    }

    public delete(key: string): void {
        this.blobs.delete(key);
    }
}

export type ServerLapisCacheConfig = {
    memoryBytes: number;
    diskBytes: number;
    dir: string | undefined;
    freshMs: number;
};

export type ServerLapisCache = {
    adapter: AxiosAdapter;
    store: LapisResponseStore;
    blobs: TieredBlobStore;
    stats: ConditionalCacheStats;
    storeStats: StoreStats;
};

export function createServerLapisCache(
    config: ServerLapisCacheConfig,
    options: LapisResponseStoreOptions & { baseAdapter?: AxiosAdapter; onError?: (message: string) => void } = {},
): ServerLapisCache {
    const stats = emptyStats();
    const storeStats = emptyStoreStats();
    const disk =
        config.dir !== undefined && config.diskBytes > 0
            ? new DiskBlobStore(config.dir, config.diskBytes, storeStats, undefined, options.onError)
            : undefined;
    const blobs = new TieredBlobStore(config.memoryBytes, disk, storeStats);
    const store = new LapisResponseStore(blobs, storeStats, options);
    const adapter = createConditionalCacheAdapter({
        store,
        stats,
        freshMs: config.freshMs,
        now: options.now,
        baseAdapter: options.baseAdapter,
    });
    return { adapter, store, blobs, stats, storeStats };
}
