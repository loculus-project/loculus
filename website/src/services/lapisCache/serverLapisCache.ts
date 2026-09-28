/**
 * SSR-side LAPIS cache: a byte-budgeted memory LRU that spills evicted entries to a disk LRU, in front of the
 * conditional-request adapter. Server-only (uses node:fs); configured from the environment at runtime.
 */
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { AxiosAdapter } from 'axios';

import {
    ByteLru,
    type BodyCodec,
    type CacheLookup,
    type ConditionalCacheStats,
    type ConditionalCacheStore,
    createConditionalCacheAdapter,
    emptyStats,
    MemoryCacheStore,
    type StoredResponse,
} from './conditionalCache.ts';
import { getInstanceLogger } from '../../logger.ts';

const MiB = 1024 * 1024;
/** Files are accounted in whole filesystem blocks, so many small entries cannot overrun the emptyDir sizeLimit. */
const DISK_BLOCK_BYTES = 4096;
const MAX_ENTRY_BYTES_CAP = 64 * MiB;

export const bufferCodec: BodyCodec<Buffer> = {
    encode: (body) => Buffer.from(body, 'utf8'),
    decode: (body) => body.toString('utf8'),
    bytes: (body) => body.length,
};

export type TierStats = {
    memoryHits: number;
    diskHits: number;
    diskWrites: number;
    diskErrors: number;
    promotions: number;
};

const emptyTierStats = (): TierStats => ({ memoryHits: 0, diskHits: 0, diskWrites: 0, diskErrors: 0, promotions: 0 });

type DiskEntry = { etag: string; validatedAt: number; file: string };

type DiskFileMeta = { v: 1; key: string; etag: string; contentType?: string; validatedAt: number; bodyBytes: number };

/**
 * One file per entry: a JSON metadata line, then the raw body. The index (key → ETag, file) lives in memory, so a
 * revalidation that ends in a 200 never reads the file. The directory's contents are discarded at startup.
 */
export class DiskCacheStore implements ConditionalCacheStore {
    private readonly index: ByteLru<DiskEntry>;
    private readonly entriesDir: string;

    constructor(
        dir: string,
        maxBytes: number,
        private readonly tierStats: TierStats = emptyTierStats(),
        private readonly maxEntryBytes: number = Math.min(maxBytes / 8, MAX_ENTRY_BYTES_CAP),
        private readonly onError: (message: string) => void = () => {},
    ) {
        this.entriesDir = path.join(dir, 'entries');
        fs.rmSync(this.entriesDir, { recursive: true, force: true });
        fs.mkdirSync(this.entriesDir, { recursive: true });
        this.index = new ByteLru(maxBytes, (_key, entry) => this.removeFile(entry.file));
    }

    public get bytes() {
        return this.index.bytes;
    }

    public get size() {
        return this.index.size;
    }

    private fileFor(key: string) {
        return path.join(this.entriesDir, createHash('sha256').update(key).digest('hex'));
    }

    private removeFile(file: string) {
        fs.promises.unlink(file).catch(() => {});
    }

    public lookup(key: string): CacheLookup | undefined {
        const entry = this.index.get(key);
        if (entry === undefined) {
            return undefined;
        }
        return { etag: entry.etag, validatedAt: entry.validatedAt, load: () => this.load(key, entry) };
    }

    private async load(key: string, entry: DiskEntry): Promise<StoredResponse | undefined> {
        try {
            const content = await fs.promises.readFile(entry.file);
            const newline = content.indexOf(0x0a);
            if (newline < 0) {
                throw new Error('no metadata line');
            }
            const meta = JSON.parse(content.subarray(0, newline).toString('utf8')) as Partial<DiskFileMeta>;
            const body = content.subarray(newline + 1);
            if (meta.v !== 1 || meta.key !== key || meta.etag !== entry.etag || meta.bodyBytes !== body.length) {
                throw new Error('metadata does not match the entry');
            }
            return { body: body.toString('utf8'), contentType: meta.contentType };
        } catch (e) {
            this.tierStats.diskErrors++;
            this.onError(`LAPIS cache: discarding unreadable disk entry ${entry.file}: ${(e as Error).message}`);
            if (this.index.get(key) === entry) {
                this.index.delete(key);
            }
            this.removeFile(entry.file);
            return undefined;
        }
    }

    /** Writes asynchronously; the entry becomes visible once the file is complete. */
    public put(key: string, etag: string, response: StoredResponse, validatedAt: number): boolean {
        const body = Buffer.from(response.body, 'utf8');
        const meta: DiskFileMeta = {
            v: 1,
            key,
            etag,
            contentType: response.contentType,
            validatedAt,
            bodyBytes: body.length,
        };
        const content = Buffer.concat([Buffer.from(JSON.stringify(meta) + '\n', 'utf8'), body]);
        const bytes = Math.ceil(content.length / DISK_BLOCK_BYTES) * DISK_BLOCK_BYTES;
        if (bytes > this.maxEntryBytes) {
            this.delete(key);
            return false;
        }
        const file = this.fileFor(key);
        const tmp = `${file}.tmp-${randomBytes(6).toString('hex')}`;
        void this.write(key, { etag, validatedAt, file }, tmp, content, bytes);
        return true;
    }

    /** Resolves once the write has finished or failed; exposed for tests. */
    public pendingWrites: Promise<void> = Promise.resolve();

    private write(key: string, entry: DiskEntry, tmp: string, content: Buffer, bytes: number) {
        const done = (async () => {
            try {
                await fs.promises.writeFile(tmp, content);
                await fs.promises.rename(tmp, entry.file);
                this.index.set(key, entry, bytes);
                this.tierStats.diskWrites++;
            } catch (e) {
                this.tierStats.diskErrors++;
                this.onError(`LAPIS cache: could not write ${entry.file}: ${(e as Error).message}`);
                await fs.promises.unlink(tmp).catch(() => {});
            }
        })();
        this.pendingWrites = Promise.all([this.pendingWrites, done]).then(() => {});
        return done;
    }

    public confirm(key: string, validatedAt: number): boolean {
        const entry = this.index.get(key);
        if (entry === undefined) {
            return false;
        }
        entry.validatedAt = validatedAt;
        return true;
    }

    public delete(key: string): void {
        const entry = this.index.delete(key);
        if (entry !== undefined) {
            this.removeFile(entry.file);
        }
    }
}

/** Memory first; entries evicted from memory, or too big for it, go to disk; a disk entry that is used moves back. */
export class TieredCacheStore implements ConditionalCacheStore {
    public readonly memory: MemoryCacheStore<Buffer>;

    constructor(
        memoryBytes: number,
        public readonly disk: DiskCacheStore | undefined,
        private readonly tierStats: TierStats = emptyTierStats(),
    ) {
        this.memory = new MemoryCacheStore(
            memoryBytes,
            bufferCodec,
            Math.min(memoryBytes / 8, MAX_ENTRY_BYTES_CAP),
            disk === undefined
                ? undefined
                : (key, entry) =>
                      disk.put(
                          key,
                          entry.etag,
                          { body: bufferCodec.decode(entry.body), contentType: entry.contentType },
                          entry.validatedAt,
                      ),
        );
    }

    public lookup(key: string): CacheLookup | undefined {
        const inMemory = this.memory.lookup(key);
        if (inMemory !== undefined) {
            this.tierStats.memoryHits++;
            return inMemory;
        }
        const onDisk = this.disk?.lookup(key);
        if (onDisk === undefined) {
            return undefined;
        }
        this.tierStats.diskHits++;
        return {
            etag: onDisk.etag,
            validatedAt: onDisk.validatedAt,
            load: async () => {
                const stored = await onDisk.load();
                if (stored !== undefined && this.memory.put(key, onDisk.etag, stored, onDisk.validatedAt)) {
                    this.tierStats.promotions++;
                    this.disk?.delete(key);
                }
                return stored;
            },
        };
    }

    public put(key: string, etag: string, response: StoredResponse, validatedAt: number): boolean {
        this.disk?.delete(key);
        if (this.memory.put(key, etag, response, validatedAt)) {
            return true;
        }
        return this.disk?.put(key, etag, response, validatedAt) ?? false;
    }

    public confirm(key: string, validatedAt: number): void {
        if (!this.memory.confirm(key, validatedAt)) {
            this.disk?.confirm(key, validatedAt);
        }
    }

    public delete(key: string): void {
        this.memory.delete(key);
        this.disk?.delete(key);
    }
}

export type ServerLapisCacheConfig = {
    memoryBytes: number;
    diskBytes: number;
    dir: string | undefined;
    freshMs: number;
};

/**
 * `LAPIS_CACHE_MEMORY_MB` (0 or unset: cache off), `LAPIS_CACHE_DISK_MB` and `LAPIS_CACHE_DIR` (disk tier, off unless
 * both are set), `LAPIS_CACHE_FRESH_SECONDS` (skip revalidation this long after the last confirmation; default 0).
 */
export function serverLapisCacheConfigFromEnv(
    env: Record<string, string | undefined>,
): ServerLapisCacheConfig | undefined {
    const number = (name: string) => {
        const value = Number(env[name] ?? '0');
        return Number.isFinite(value) && value > 0 ? value : 0;
    };
    const memoryBytes = Math.floor(number('LAPIS_CACHE_MEMORY_MB') * MiB);
    if (memoryBytes === 0) {
        return undefined;
    }
    const dir = env.LAPIS_CACHE_DIR !== undefined && env.LAPIS_CACHE_DIR !== '' ? env.LAPIS_CACHE_DIR : undefined;
    return {
        memoryBytes,
        diskBytes: dir === undefined ? 0 : Math.floor(number('LAPIS_CACHE_DISK_MB') * MiB),
        dir,
        freshMs: Math.floor(number('LAPIS_CACHE_FRESH_SECONDS') * 1000),
    };
}

export type ServerLapisCache = {
    adapter: AxiosAdapter;
    store: TieredCacheStore;
    stats: ConditionalCacheStats;
    tierStats: TierStats;
};

export function createServerLapisCache(
    config: ServerLapisCacheConfig,
    options: { now?: () => number; baseAdapter?: AxiosAdapter; onError?: (message: string) => void } = {},
): ServerLapisCache {
    const stats = emptyStats();
    const tierStats = emptyTierStats();
    const disk =
        config.dir !== undefined && config.diskBytes > 0
            ? new DiskCacheStore(config.dir, config.diskBytes, tierStats, undefined, options.onError)
            : undefined;
    const store = new TieredCacheStore(config.memoryBytes, disk, tierStats);
    const adapter = createConditionalCacheAdapter({
        store,
        stats,
        freshMs: config.freshMs,
        now: options.now,
        baseAdapter: options.baseAdapter,
    });
    return { adapter, store, stats, tierStats };
}

const STATS_LOG_INTERVAL_MS = 60_000;

let serverCache: ServerLapisCache | null | undefined;

/** The process-wide SSR cache adapter, or undefined when `LAPIS_CACHE_MEMORY_MB` is not set. */
export function getServerLapisCacheAdapter(): AxiosAdapter | undefined {
    if (serverCache === undefined) {
        serverCache = null;
        const config = serverLapisCacheConfigFromEnv(process.env);
        if (config !== undefined) {
            const logger = getInstanceLogger('lapisCache');
            try {
                serverCache = createServerLapisCache(config, { onError: (message) => logger.warn(message) });
                logger.info(`LAPIS SSR cache enabled: ${JSON.stringify(config)}`);
                startStatsLog(serverCache, logger.info);
            } catch (e) {
                logger.error(`LAPIS SSR cache disabled, could not initialise: ${(e as Error).message}`);
            }
        }
    }
    return serverCache?.adapter;
}

function startStatsLog(cache: ServerLapisCache, log: (message: string) => void) {
    let last = '';
    const timer = setInterval(() => {
        const counters = JSON.stringify({ ...cache.stats, ...cache.tierStats });
        if (counters === last) {
            return;
        }
        last = counters;
        log(
            `LAPIS SSR cache stats: ${JSON.stringify({
                ...cache.stats,
                ...cache.tierStats,
                memoryEntries: cache.store.memory.size,
                memoryBytes: cache.store.memory.bytes,
                diskEntries: cache.store.disk?.size ?? 0,
                diskBytes: cache.store.disk?.bytes ?? 0,
            })}`,
        );
    }, STATS_LOG_INTERVAL_MS);
    timer.unref();
}
